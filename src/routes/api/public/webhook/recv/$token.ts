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

function calcScore(opts: {
  avgResponseTimeSeconds: number | null;
  status: string;
  converted: boolean;
}): number {
  const t = opts.avgResponseTimeSeconds ?? 999;
  const notaTempo = t <= 120 ? 100 : t <= 300 ? 70 : t <= 600 ? 40 : 10;
  const notaStatus = opts.status === "resolved" ? 100 : opts.status === "ongoing" ? 50 : 10;
  const notaConversao = opts.converted ? 100 : 0;
  return Math.round(notaTempo * 0.4 + notaStatus * 0.35 + notaConversao * 0.25);
}

export const Route = createFileRoute("/api/public/webhook/recv/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

        if (!payload) return Response.json({ error: "Empty body" }, { status: 400 });

        // Lookup operator by token
        const { data: operator } = await supabaseAdmin
          .from("operators")
          .select("*")
          .eq("token", token)
          .maybeSingle();

        if (!operator) {
          await supabaseAdmin.from("webhook_logs").insert({
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
          await supabaseAdmin.from("webhook_logs").insert({
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
          await supabaseAdmin.from("webhook_logs").insert({
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
          await supabaseAdmin.from("webhook_logs").insert({
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
          await supabaseAdmin.from("webhook_logs").insert({
            operator_id: operator.id,
            http_status: 200,
            payload_raw: payload as never,
            processed: false,
            error_message: "Mensagem de grupo ignorada",
            origin_ip: originIp,
          });
          return Response.json({ ignored: true });
        }

        const fromMe = payload.data?.key?.fromMe ?? false;
        const leadPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
        const leadName = payload.data?.pushName || leadPhone;
        const fromRole = fromMe ? "operator" : "lead";
        const msg = payload.data?.message ?? {};
        const messageText =
          (msg as { conversation?: string }).conversation ||
          (msg as { extendedTextMessage?: { text?: string } }).extendedTextMessage?.text ||
          "[mídia]";
        const messageType = detectMessageType(msg);
        const tsRaw = payload.data?.messageTimestamp;
        const sentAt = new Date((tsRaw ? tsRaw : Date.now() / 1000) * 1000).toISOString();

        // Upsert conversation
        const { data: convUpsert, error: convError } = await supabaseAdmin
          .from("conversations")
          .upsert(
            {
              operator_id: operator.id,
              remote_jid: remoteJid,
              lead_phone: leadPhone,
              lead_name: leadName,
              instance_name: operator.instance_name,
              status: "ongoing",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "operator_id,remote_jid" }
          )
          .select()
          .single();

        if (convError || !convUpsert) {
          await supabaseAdmin.from("webhook_logs").insert({
            operator_id: operator.id,
            http_status: 500,
            payload_raw: payload as never,
            processed: false,
            error_message: `Erro ao salvar conversa: ${convError?.message ?? "unknown"}`,
            origin_ip: originIp,
          });
          return Response.json({ error: "DB error" }, { status: 500 });
        }

        const conversation = convUpsert;

        // Response time: delta vs last opposite-role message
        const { data: lastOpposite } = await supabaseAdmin
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
        const { error: msgError } = await supabaseAdmin.from("messages").insert({
          conversation_id: conversation.id,
          operator_id: operator.id,
          from_role: fromRole,
          message_text: messageText,
          message_type: messageType,
          sent_at: sentAt,
          response_time_s: responseTimeSec,
          lead_name: leadName,
          lead_phone: leadPhone,
          raw_payload: payload as never,
        });

        if (msgError) {
          await supabaseAdmin.from("webhook_logs").insert({
            operator_id: operator.id,
            http_status: 500,
            payload_raw: payload as never,
            processed: false,
            error_message: `Erro ao salvar mensagem: ${msgError.message}`,
            origin_ip: originIp,
          });
          return Response.json({ error: "DB error" }, { status: 500 });
        }

        // Recalculate avg response time & score
        const { data: opResponses } = await supabaseAdmin
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

        const score = calcScore({
          avgResponseTimeSeconds: avgRt,
          status: conversation.status,
          converted: conversation.converted,
        });

        await supabaseAdmin
          .from("conversations")
          .update({
            avg_response_time_s: avgRt,
            score_sac: score,
            total_messages: (conversation.total_messages ?? 0) + 1,
          })
          .eq("id", conversation.id);

        // Update operator counters
        await supabaseAdmin
          .from("operators")
          .update({
            last_received_at: new Date().toISOString(),
            messages_today: (operator.messages_today ?? 0) + 1,
            status: operator.status === "pending" ? "active" : operator.status,
          })
          .eq("id", operator.id);

        // Success log
        await supabaseAdmin.from("webhook_logs").insert({
          operator_id: operator.id,
          http_status: 200,
          payload_raw: payload as never,
          processed: true,
          origin_ip: originIp,
        });

        return Response.json({
          received: true,
          conversation_id: conversation.id,
          response_time_s: responseTimeSec,
          score_sac: score,
        });
      },
    },
  },
});
