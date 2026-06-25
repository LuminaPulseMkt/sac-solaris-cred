import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  pdfBase64: z.string().min(10),
  fileName: z.string().min(1),
  period: z.string(),
  metrics: z.object({
    total: z.number(),
    avgScore: z.number(),
    avgResponseTime: z.number(),
    conversionRate: z.number(),
  }),
});

function fmtDuration(s: number): string {
  if (!s || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const rest = Math.floor(s % 60);
  return m > 0 ? `${m}m ${rest}s` : `${rest}s`;
}

function buildCaption(period: string, m: z.infer<typeof schema>["metrics"]): string {
  return [
    `📊 *Relatório SAC — ${period}*`,
    "",
    "📈 Resumo do período:",
    `✅ Conversas: ${m.total}`,
    `⭐ Score médio: ${m.avgScore}/100`,
    `⏱ Tempo médio de resposta: ${fmtDuration(m.avgResponseTime)}`,
    `🎯 Taxa de conversão: ${m.conversionRate.toFixed(1)}%`,
    "",
    "_Gerado automaticamente pelo Solaris Analytics Chat_",
    `_${new Date().toLocaleString("pt-BR")}_`,
  ].join("\n");
}

export const sendReportViaWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("app_settings")
      .select("key,value")
      .in("key", [
        "evolution_api_url",
        "evolution_api_key",
        "report_evolution_instance",
        "report_whatsapp_numbers",
      ]);

    const map: Record<string, string> = {};
    for (const r of rows ?? []) map[r.key] = r.value ?? "";
    const url = (map.evolution_api_url ?? "").replace(/\/+$/, "");
    const apiKey = map.evolution_api_key ?? "";
    const instance = map.report_evolution_instance ?? "";

    let numbers: Array<{ number: string; label?: string }> = [];
    try {
      numbers = JSON.parse(map.report_whatsapp_numbers || "[]");
    } catch {
      numbers = [];
    }

    if (!url || !apiKey) throw new Error("Evolution API não configurada");
    if (!instance) throw new Error("Instância de envio não selecionada");
    if (numbers.length === 0) throw new Error("Nenhum número cadastrado");

    const caption = buildCaption(data.period, data.metrics);
    const results: Array<{ number: string; ok: boolean; error?: string }> = [];

    for (const n of numbers) {
      try {
        const res = await fetch(`${url}/message/sendMedia/${encodeURIComponent(instance)}`, {
          method: "POST",
          headers: { apikey: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            number: n.number,
            mediatype: "document",
            mimetype: "application/pdf",
            media: data.pdfBase64,
            fileName: data.fileName,
            caption,
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          results.push({ number: n.number, ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` });
        } else {
          results.push({ number: n.number, ok: true });
        }
      } catch (e) {
        results.push({ number: n.number, ok: false, error: e instanceof Error ? e.message : "Erro" });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    return { sent, failed: results.length - sent, results };
  });
