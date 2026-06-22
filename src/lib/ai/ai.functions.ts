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
