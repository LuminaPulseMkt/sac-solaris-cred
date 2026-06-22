import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const analyzeConversationFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { analyzeConversationById } = await import("@/lib/ai/analyze.server");
    return analyzeConversationById(data.conversationId);
  });

export const getConversationAnalysis = createServerFn({ method: "GET" })
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

export const listAnalyses = createServerFn({ method: "GET" })
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

export const isOpenAiConfigured = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "openai_api_key").maybeSingle();
  return { configured: Boolean(data?.value && data.value.trim().length > 0) };
});

export const analyzeAllPending = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ operator_id: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { analyzeConversationById } = await import("@/lib/ai/analyze.server");
    for (const conv of pending ?? []) {
      try {
        await analyzeConversationById(conv.id);
        analyzed++;
        await new Promise((r) => setTimeout(r, 600));
      } catch {
        failed++;
      }
    }
    return { analyzed, failed, total: pending?.length ?? 0 };
  });

export const getOperatorAiReport = createServerFn({ method: "GET" })
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

