import { createFileRoute } from "@tanstack/react-router";

const IDLE_CUTOFF_MINUTES = 15;
const BATCH_SIZE = 10;

export const Route = createFileRoute("/api/internal/sweep-analysis")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: secretRow } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "internal_sweep_secret")
          .maybeSingle();
        const expected = secretRow?.value ?? "";
        const provided = request.headers.get("x-sweep-secret") ?? "";
        if (!expected || provided !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: autoRow } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "ai_auto_analyze")
          .maybeSingle();
        if ((autoRow?.value ?? "false") !== "true") {
          return Response.json({ skipped: true, reason: "ai_auto_analyze desabilitado" });
        }

        const cutoff = new Date(Date.now() - IDLE_CUTOFF_MINUTES * 60 * 1000).toISOString();
        const { data: candidates } = await supabaseAdmin
          .from("conversations")
          .select("id, updated_at")
          .eq("status", "ongoing")
          .gte("total_messages", 1)
          .lt("updated_at", cutoff)
          .order("updated_at", { ascending: true })
          .limit(BATCH_SIZE);

        if (!candidates || candidates.length === 0) {
          return Response.json({ analyzed: 0, skipped: 0, failed: 0, candidates: 0 });
        }

        const ids = candidates.map((c) => c.id);
        const { data: analyses } = await supabaseAdmin
          .from("ai_analyses")
          .select("conversation_id, analyzed_at")
          .in("conversation_id", ids);

        const lastAnalyzedByConv = new Map<string, string>();
        for (const a of analyses ?? []) {
          if (!a.conversation_id) continue;
          const cur = lastAnalyzedByConv.get(a.conversation_id);
          if (!cur || new Date(a.analyzed_at) > new Date(cur)) {
            lastAnalyzedByConv.set(a.conversation_id, a.analyzed_at);
          }
        }

        const { analyzeConversationById } = await import("@/lib/ai/analyze.server");
        let analyzed = 0;
        let skipped = 0;
        let failed = 0;

        for (const c of candidates) {
          const lastAnalyzed = lastAnalyzedByConv.get(c.id);
          if (lastAnalyzed && new Date(lastAnalyzed) >= new Date(c.updated_at)) {
            skipped++;
            continue;
          }
          try {
            await analyzeConversationById(c.id);
            analyzed++;
          } catch (e) {
            failed++;
            console.error("[sweep-analysis] falha em", c.id, e);
          }
        }

        return Response.json({ analyzed, skipped, failed, candidates: candidates.length });
      },
    },
  },
});
