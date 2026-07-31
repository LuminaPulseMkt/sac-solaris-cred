import { createFileRoute } from "@tanstack/react-router";

type EvolutionPayload = {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    message?: Record<string, unknown>;
    messageTimestamp?: number;
    messageType?: string;
  };
};

const TYPE_MAP: Record<string, string> = {
  conversation: "text",
  extendedTextMessage: "text",
  imageMessage: "image",
  audioMessage: "audio",
  documentMessage: "document",
  stickerMessage: "sticker",
  videoMessage: "video",
  locationMessage: "location",
};

function detectMessageType(message: Record<string, unknown> | undefined): string {
  if (!message) return "text";
  for (const key of Object.keys(message)) {
    if (TYPE_MAP[key]) return TYPE_MAP[key];
  }
  return "text";
}

// FIX 1: calcScore agora usa os mesmos valores de score.ts
function calcScore(opts: {
  avgResponseTimeSeconds: number | null;
  status: string;
  converted: boolean;
}): number {
  const t = opts.avgResponseTimeSeconds ?? 999;
  const minutes = t / 60;
  const notaTempo = minutes <= 2 ? 100 : minutes <= 5 ? 70 : minutes <= 10 ? 40 : 10;
  // Alinhado com score.ts: ongoing=60, resolved=100, escalated=20
  const notaStatus = opts.status === "resolved" ? 100 : opts.status === "ongoing" ? 60 : 20;
  // Alinhado com score.ts: converted=100, not converted=30
  const notaConversao = opts.converted ? 100 : 30;
  return Math.round(notaTempo * 0.4 + notaStatus * 0.35 + notaConversao * 0.25);
}

export const Route = createFileRoute("/api/public/webhook/recv/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { supabaseAdmin, getClientForToken } = await import("@/integrations/supabase/client.server");
        const token = params.token;
        const originIp = request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? null;

        let payload: EvolutionPayload | null = null;
        let rawText = "";
        try {
          rawText = await request.text();
          if (rawText.length > 2_000_000) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
          }
          payload = rawText ? (JSON.parse(rawText) as EvolutionPayload) : null;
        } catch {
          await supabaseAdmin.from("webhook_logs").insert({
            received_at: new Date().toISOString(),
            http_status: 400,
            payload_raw: { raw: rawText.slice(0, 1000) } as never,
            processed: false,
            error_message: "JSON inválido",
            origin_ip: originIp,
          });
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        // Resolver client do tenant pelo token.
        const resolved = await getClientForToken(token);
        const supabase = resolved?.client ?? supabaseAdmin;

        if (!payload) return Response.json({ error: "Empty body" }, { status: 400 });

        // Lookup operator by token
        const { data: operator } = await supabase
          .from("operators")
          .select("*")
          .eq("token", token)
          .maybeSingle();

        if (!operator) {
          await supabase.from("webhook_logs").insert({
            received_at: new Date().toISOString(),
            http_status: 401,
            payload_raw: payload as never,
            processed: false,
            error_message: "Token inválido",
            origin_ip: originIp,
          });
          return Response.json({ error: "Invalid token" }, { status: 401 });
        }

        if (operator.status === "inactive") {
          await supabase.from("webhook_logs").insert({
            operator_id: operator.id,
            http_status: 403,
            payload_raw: payload as never,
            processed: false,
            error_message: "Operador inativo",
            origin_ip: originIp,
          });
          return Response.json({ error: "Operator inactive" }, { status: 403 });
        }

        // Silently ignore non-message events
        if (payload.event && payload.event !== "messages.upsert") {
          await supabase.from("webhook_logs").insert({
            operator_id: operator.id,
            http_status: 200,
            payload_raw: payload as never,
            processed: false,
            error_message: `Evento ignorado: ${payload.event}`,
            origin_ip: originIp,
          });
          return Response.json({ ignored: true });
        }

        // Optional cross-validation: instance must match if provided
        if (payload.instance && operator.instance_name && payload.instance !== operator.instance_name) {
          await supabase.from("webhook_logs").insert({
            operator_id: operator.id,
            http_status: 401,
            payload_raw: payload as never,
            processed: false,
            error_message: `Instância não confere: ${payload.instance} ≠ ${operator.instance_name}`,
            origin_ip: originIp,
          });
          return Response.json({ error: "Instance mismatch" }, { status: 401 });
        }

        const remoteJid = payload.data?.key?.remoteJid;
        if (!remoteJid) {
          return Response.json({ error: "Missing remoteJid" }, { status: 400 });
        }

        // Ignore groups
        if (remoteJid.includes("@g.us")) {
          await supabase.from("webhook_logs").insert({
            operator_id: operator.id,
            http_status: 200,
            payload_raw: { remoteJid, event: payload.event ?? "messages.upsert" } as never,
            processed: false,
            error_message: "Mensagem de grupo ignorada",
            origin_ip: originIp,
          });
          return Response.json({ ignored: true });
        }

        const { resolvePushName, resolveLeadName } = await import("@/lib/sac/lead-name");
        const fromMe = payload.data?.key?.fromMe ?? false;
        const leadPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
        const pushName = resolvePushName(fromMe, payload.data?.pushName);
        const leadName = resolveLeadName({ fromMe, pushName, leadPhone });
        const fromRole = fromMe ? "operator" : "lead";
        const msg = payload.data?.message ?? {};
        const messageType = detectMessageType(msg);

        let messageText: string =
          (msg as { conversation?: string }).conversation ||
          (msg as { extendedTextMessage?: { text?: string } }).extendedTextMessage?.text ||
          "";

        let transcriptionStatus: string | null = null;
        let transcriptionError: string | null = null;
        let audioDurationS: number | null = null;

        if (messageType === "audio" && !messageText) {
          const { extractAudioFromPayload, prepareAudioForTranscription, transcribeAudio } = await import(
            "@/lib/ai/transcribe.server"
          );
          const audioInfo = extractAudioFromPayload(msg);
          if (audioInfo) {
            audioDurationS = audioInfo.durationSeconds ?? null;
            transcriptionStatus = "pending";

            const transcribed = await prepareAudioForTranscription(audioInfo, {
              // Sempre usar o instance_name do operador — payload.instance pode vir abreviado
              // (ex.: "Thiago") enquanto a Evolution só conhece "Thiago Cred".
              instance: operator.instance_name || payload.instance || "",
              messagePayload: payload.data,
            })
              .then((preparedAudio) => transcribeAudio(preparedAudio))
              .catch((e) => {
                transcriptionError = e instanceof Error ? e.message : String(e);
                console.error("[webhook] transcribeAudio erro:", transcriptionError);
                return null;
              });
            if (transcribed) {
              messageText = `🎤 ${transcribed}`;
              transcriptionStatus = "done";
            } else {
              messageText = "[áudio não transcrito]";
              transcriptionStatus = "failed";
            }
          } else {
            transcriptionStatus = "failed";
            transcriptionError = "Payload de áudio sem audioMessage/pttMessage";
            messageText = "[áudio não transcrito]";
          }
        }

        if (!messageText) {
          const midiaTitles: Record<string, string> = {
            image: "[imagem]",
            video: "[vídeo]",
            document: "[documento]",
            sticker: "[figurinha]",
            location: "[localização]",
          };
          messageText = midiaTitles[messageType] ?? "[mídia]";
        }
        const tsRaw = payload.data?.messageTimestamp;
        const sentAt = new Date((tsRaw ? tsRaw : Date.now() / 1000) * 1000).toISOString();

        // ── Nova lógica de sessão ─────────────────────────────────────────
        // Buscar a conversa mais recente deste lead com este operador
        const { data: lastConv } = await supabase
          .from("conversations")
          .select("id, status, converted, total_messages, avg_response_time_s, score_sac, updated_at, lead_name")
          .eq("operator_id", operator.id)
          .eq("remote_jid", remoteJid)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Threshold configurável via app_settings (padrão 8h)
        const { data: thresholdRow } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "session_idle_threshold_hours")
          .maybeSingle();
        const IDLE_THRESHOLD_MS =
          (parseInt(thresholdRow?.value ?? "8", 10) || 8) * 60 * 60 * 1000;

        const isConvClosed =
          !!lastConv && lastConv.status !== "ongoing";
        const isConvIdle =
          !!lastConv &&
          lastConv.status === "ongoing" &&
          Date.now() - new Date(lastConv.updated_at).getTime() > IDLE_THRESHOLD_MS;
        const shouldCreateNew = !lastConv || isConvClosed || isConvIdle;

        let conversation: NonNullable<typeof lastConv>;

        if (shouldCreateNew) {
          // Nova sessão: encerra a anterior que ficou ociosa como "expired"
          // para não deixar conversas eternamente "ongoing".
          if (isConvIdle && lastConv) {
            await supabase
              .from("conversations")
              .update({
                status: "expired",
                ended_at: lastConv.updated_at,
                updated_at: new Date().toISOString(),
              } as never)
              .eq("id", lastConv.id);
          }

          const { data: newConv, error: convError } = await supabase
            .from("conversations")
            .insert({
              operator_id: operator.id,
              remote_jid: remoteJid,
              lead_phone: leadPhone,
              lead_name: leadName,
              instance_name: operator.instance_name,
              status: "ongoing",
            } as never)
            .select("id, status, converted, total_messages, avg_response_time_s, score_sac, updated_at, lead_name")
            .single();

          if (convError || !newConv) {
            await supabase.from("webhook_logs").insert({
              operator_id: operator.id,
              http_status: 500,
              payload_raw: payload as never,
              processed: false,
              error_message: `Erro ao criar conversa: ${convError?.message ?? "unknown"}`,
              origin_ip: originIp,
            });
            return Response.json({ error: "DB error" }, { status: 500 });
          }
          conversation = newConv;
        } else {
          if (lastConv!.status !== "ongoing") {
            await supabase
              .from("conversations")
              .update({ status: "ongoing", ended_at: null })
              .eq("id", lastConv!.id);
          }
          conversation = lastConv!;
        }

        const existingConv = shouldCreateNew ? null : lastConv;

        // Response time: delta vs last opposite-role message
        const { data: lastOpposite } = await supabase
          .from("messages")
          .select("sent_at")
          .eq("conversation_id", conversation.id)
          .neq("from_role", fromRole)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const responseTimeSec = lastOpposite
          ? Math.max(
              0,
              Math.floor((new Date(sentAt).getTime() - new Date(lastOpposite.sent_at).getTime()) / 1000)
            )
          : null;

        // Insert message
        const { error: msgError } = await supabase.from("messages").insert({
          conversation_id: conversation.id,
          operator_id: operator.id,
          from_role: fromRole,
          message_text: messageText,
          message_type: messageType,
          sent_at: sentAt,
          response_time_s: responseTimeSec,
          lead_name: leadName,
          lead_phone: leadPhone,
          transcription_status: transcriptionStatus,
          audio_duration_s: audioDurationS,
          raw_payload: payload as never,
        } as never);

        if (msgError) {
          await supabase.from("webhook_logs").insert({
            operator_id: operator.id,
            http_status: 500,
            payload_raw: payload as never,
            processed: false,
            error_message: `Erro ao salvar mensagem: ${msgError.message}`,
            origin_ip: originIp,
          });
          return Response.json({ error: "DB error" }, { status: 500 });
        }

        // Recalculate avg response time using only operator responses
        const { data: opResponses } = await supabase
          .from("messages")
          .select("response_time_s")
          .eq("conversation_id", conversation.id)
          .eq("from_role", "operator")
          .not("response_time_s", "is", null);

        const validRts = (opResponses ?? [])
          .map((r) => r.response_time_s)
          .filter((n): n is number => typeof n === "number");
        const avgRt = validRts.length
          ? Math.round(validRts.reduce((a, b) => a + b, 0) / validRts.length)
          : null;

        // FIX 4: score calculado com status real da conversa (não forçado como "ongoing")
        const score = calcScore({
          avgResponseTimeSeconds: avgRt,
          status: conversation.status,
          converted: conversation.converted,
        });

        // Backfill de lead_name quando chega pushName real
        const { shouldUpdateLeadName } = await import("@/lib/sac/lead-name");
        const shouldUpdateName = shouldUpdateLeadName({
          pushName,
          currentLeadName: conversation.lead_name ?? null,
          leadPhone,
        });

        await supabase
          .from("conversations")
          .update({
            avg_response_time_s: avgRt,
            score_sac: score,
            total_messages: (existingConv?.total_messages ?? conversation.total_messages ?? 0) + 1,
            ...(shouldUpdateName ? { lead_name: pushName } : {}),
          })
          .eq("id", conversation.id);

        // FIX 3: messages_today — reseta se o último recebimento foi em outro dia
        const lastReceivedAt = operator.last_received_at ? new Date(operator.last_received_at) : null;
        const todayStr = new Date().toISOString().slice(0, 10);
        const lastDayStr = lastReceivedAt ? lastReceivedAt.toISOString().slice(0, 10) : null;
        const isNewDay = lastDayStr !== todayStr;

        await supabase
          .from("operators")
          .update({
            last_received_at: new Date().toISOString(),
            // Zera o contador se for um novo dia, senão incrementa
            messages_today: isNewDay ? 1 : (operator.messages_today ?? 0) + 1,
            status: operator.status === "pending" ? "active" : operator.status,
          })
          .eq("id", operator.id);

        // Success log
        await supabase.from("webhook_logs").insert({
          operator_id: operator.id,
          http_status: 200,
          payload_raw: payload as never,
          processed: true,
          error_message: transcriptionError ? `Falha na transcrição: ${transcriptionError}` : null,
          origin_ip: originIp,
        });

        // Fire-and-forget AI analysis trigger
        try {
          const { data: autoRow } = await supabase
            .from("app_settings")
            .select("value")
            .eq("key", "ai_auto_analyze")
            .maybeSingle();
          const autoEnabled = (autoRow?.value ?? "false") === "true";
          if (autoEnabled) {
            const newTotal = (existingConv?.total_messages ?? conversation.total_messages ?? 0) + 1;
            const closingRegex = /\b(tchau|at[ée] logo|obrigad|encerrando|encerrado|at[ée] mais|tenha um bom|qualquer d[uú]vida|foi um prazer|abra[cç]os)\b/i;
            const idleMs = lastOpposite ? Date.now() - new Date(lastOpposite.sent_at).getTime() : 0;
            const shouldAnalyze =
              newTotal % 10 === 0 ||
              (fromMe && closingRegex.test(messageText)) ||
              (!fromMe && idleMs > 30 * 60 * 1000);
            if (shouldAnalyze) {
              import("@/lib/ai/analyze.server")
                .then((m) => m.analyzeConversationById(conversation.id))
                .catch(() => {});
            }
          }
        } catch {
          // never block webhook response
        }

        return Response.json({
          received: true,
          conversation_id: conversation.id,
          transcription_status: transcriptionStatus,
          transcription_error: transcriptionError,
          response_time_s: responseTimeSec,
          score_sac: score,
        });
      },
    },
  },
});
