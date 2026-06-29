import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const testWhisperTranscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        base64: z.string().min(10),
        mimeType: z.string().default("audio/ogg"),
        durationSeconds: z.number().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const started = Date.now();
    try {
      const { transcribeAudio } = await import("@/lib/ai/transcribe.server");
      const text = await transcribeAudio({
        base64: data.base64,
        mimeType: data.mimeType,
        durationSeconds: data.durationSeconds,
      });
      return {
        ok: Boolean(text),
        text: text ?? null,
        elapsedMs: Date.now() - started,
        error: text ? null : "Whisper retornou vazio (veja logs do servidor)",
      };
    } catch (e) {
      return {
        ok: false,
        text: null,
        elapsedMs: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });


export const analyzeConversationFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { analyzeConversationById } = await import("@/lib/ai/analyze.server");
    return analyzeConversationById(data.conversationId);
  });

export const getConversationAnalysis = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("ai_analyses")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("analyzed_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return rows?.[0] ?? null;
  });

export const listAnalyses = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ since: z.string().datetime().optional(), operatorId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("ai_analyses").select("*").order("analyzed_at", { ascending: false });
    if (data.since) q = q.gte("analyzed_at", data.since);
    if (data.operatorId) q = q.eq("operator_id", data.operatorId);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const isOpenAiConfigured = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "openai_api_key").maybeSingle();
  return { configured: Boolean(data?.value && data.value.trim().length > 0) };
});

export const analyzeAllPending = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ operator_id: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: keyRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "openai_api_key")
      .maybeSingle();
    if (!keyRow?.value || !String(keyRow.value).trim()) {
      throw new Error("OpenAI não configurada. Acesse Configurações → Integrações.");
    }

    const { data: done } = await supabaseAdmin.from("ai_analyses").select("conversation_id");
    const doneIds = (done ?? []).map((r) => r.conversation_id).filter(Boolean) as string[];

    let query = supabaseAdmin
      .from("conversations")
      .select("id, operator_id, total_messages")
      .gte("total_messages", 2)
      .order("started_at", { ascending: false })
      .limit(50);
    if (doneIds.length > 0) query = query.not("id", "in", `(${doneIds.join(",")})`);
    if (data.operator_id) query = query.eq("operator_id", data.operator_id);

    const { data: pending } = await query;
    let analyzed = 0;
    let failed = 0;
    let firstError: string | null = null;
    const { analyzeConversationById } = await import("@/lib/ai/analyze.server");
    for (const conv of pending ?? []) {
      try {
        await analyzeConversationById(conv.id);
        analyzed++;
        await new Promise((r) => setTimeout(r, 600));
      } catch (e) {
        failed++;
        if (!firstError) firstError = e instanceof Error ? e.message : String(e);
        console.error("[analyzeAllPending] falha em", conv.id, e);
      }
    }
    return { analyzed, failed, total: pending?.length ?? 0, firstError };
  });

export const getOperatorAiReport = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        operator_id: z.string().uuid().optional(),
        period: z.enum(["24h", "7d", "30d", "all"]).default("7d"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date();
    if (data.period === "24h") cutoff.setHours(cutoff.getHours() - 24);
    else if (data.period === "7d") cutoff.setDate(cutoff.getDate() - 7);
    else if (data.period === "30d") cutoff.setDate(cutoff.getDate() - 30);
    else cutoff.setFullYear(2000);

    let q = supabaseAdmin
      .from("ai_analyses")
      .select("*, operators(name, instance_name)")
      .gte("analyzed_at", cutoff.toISOString())
      .order("analyzed_at", { ascending: false });
    if (data.operator_id) q = q.eq("operator_id", data.operator_id);
    const { data: analyses } = await q;

    const total = analyses?.length ?? 0;
    const avgQuality = total
      ? Math.round(analyses!.reduce((s, a) => s + (a.quality_score ?? 0), 0) / total)
      : 0;
    const sentiments = {
      positive: analyses?.filter((a) => a.sentiment === "positive").length ?? 0,
      neutral: analyses?.filter((a) => a.sentiment === "neutral").length ?? 0,
      negative: analyses?.filter((a) => a.sentiment === "negative").length ?? 0,
    };

    const topicCount: Record<string, number> = {};
    const impCount: Record<string, number> = {};
    analyses?.forEach((a) => {
      (Array.isArray(a.topics) ? (a.topics as string[]) : []).forEach((t) => {
        topicCount[t] = (topicCount[t] ?? 0) + 1;
      });
      (Array.isArray(a.improvements) ? (a.improvements as string[]) : []).forEach((i) => {
        impCount[i] = (impCount[i] ?? 0) + 1;
      });
    });
    const topTopics = Object.entries(topicCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([topic, count]) => ({ topic, count }));
    const topImprovements = Object.entries(impCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([text, count]) => ({ text, count }));

    const { data: metrics } = await supabaseAdmin
      .from("operator_ai_metrics")
      .select("*, operators(name, instance_name, channel)");

    return {
      period: data.period,
      total,
      ended: analyses?.filter((a) => a.ended).length ?? 0,
      ongoing: analyses?.filter((a) => !a.ended).length ?? 0,
      avgQualityScore: avgQuality,
      sentiments,
      topTopics,
      topImprovements,
      analyses: analyses ?? [],
      operatorMetrics: metrics ?? [],
    };
  });


export const transcribePendingAudios = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversation_id: z.string().uuid().optional(),
        limit: z.number().default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("messages")
      .select("id, raw_payload, message_type, audio_duration_s" as never)
      .eq("message_type", "audio")
      .or(
        "message_text.is.null,message_text.eq.[mídia],message_text.eq.[áudio],message_text.eq.[áudio não transcrito]",
      )
      .limit(data.limit);

    if (data.conversation_id) q = q.eq("conversation_id", data.conversation_id);

    const { data: msgs } = await q;
    let transcribed = 0;
    let failed = 0;

    const { transcribeAudio, extractAudioFromPayload, prepareAudioForTranscription } = await import(
      "@/lib/ai/transcribe.server"
    );

    for (const msg of (msgs ?? []) as unknown as Array<{ id: string; raw_payload: unknown }>) {
      try {
        const rawPayload = msg.raw_payload as Record<string, unknown> | null;
        const dataNode = (rawPayload as { data?: Record<string, unknown> })?.data;
        const msgData = (dataNode as { message?: Record<string, unknown> } | undefined)?.message;
        if (!msgData) {
          failed++;
          continue;
        }
        const audioInfo = extractAudioFromPayload(msgData);
        if (!audioInfo) {
          failed++;
          continue;
        }
        const preparedAudio = await prepareAudioForTranscription(audioInfo, {
          instance: (rawPayload as { instance?: string })?.instance ?? "",
          messagePayload: dataNode,
        });
        const text = await transcribeAudio(preparedAudio);
        await supabaseAdmin
          .from("messages")
          .update({
            message_text: text ? `🎤 ${text}` : "[áudio não transcrito]",
            transcription_status: text ? "done" : "failed",
          } as never)
          .eq("id", msg.id);
        text ? transcribed++ : failed++;
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {
        console.error("[transcribePendingAudios] falha em", msg.id, e);
        await supabaseAdmin
          .from("messages")
          .update({ transcription_status: "failed" } as never)
          .eq("id", msg.id);
        failed++;
      }
    }

    return { transcribed, failed, total: msgs?.length ?? 0 };
  });
