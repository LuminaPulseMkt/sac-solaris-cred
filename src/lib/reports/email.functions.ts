import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  period: z.string(),
  sections: z.object({
    general: z.boolean(),
    perOperator: z.boolean(),
    instanceStatus: z.boolean(),
  }),
  metrics: z
    .object({
      total: z.number(),
      avgScore: z.number(),
      avgResponseTime: z.number(),
      conversionRate: z.number(),
    })
    .optional(),
  ranking: z
    .array(z.object({ Operador: z.string(), Conversas: z.number(), Score: z.number() }))
    .optional(),
});

function fmtDuration(s: number): string {
  if (!s || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const rest = Math.floor(s % 60);
  return m > 0 ? `${m}m ${rest}s` : `${rest}s`;
}

export const sendReportViaEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settingRows } = await supabaseAdmin
      .from("app_settings")
      .select("key,value")
      .in("key", ["alert_notification_emails", "evolution_api_url", "evolution_api_key"]);
    const map: Record<string, string> = {};
    for (const r of settingRows ?? []) map[r.key] = r.value ?? "";

    let recipients: string[] = [];
    try {
      recipients = JSON.parse(map.alert_notification_emails || "[]");
    } catch {
      recipients = [];
    }
    if (recipients.length === 0) {
      throw new Error(
        "Nenhum destinatário configurado em Configurações → Integrações → Destinatários de alertas.",
      );
    }

    const parts: string[] = [];
    parts.push(`<h2>📊 Relatório SAC — ${data.period}</h2>`);

    if (data.sections.general && data.metrics) {
      const m = data.metrics;
      parts.push(`
        <h3>Resumo geral</h3>
        <ul>
          <li>Conversas: ${m.total}</li>
          <li>Score médio: ${m.avgScore}/100</li>
          <li>Tempo médio de resposta: ${fmtDuration(m.avgResponseTime)}</li>
          <li>Taxa de conversão: ${m.conversionRate.toFixed(1)}%</li>
        </ul>
      `);
    }

    if (data.sections.perOperator && data.ranking && data.ranking.length > 0) {
      const rows = data.ranking
        .map((r) => `<tr><td>${r.Operador}</td><td>${r.Conversas}</td><td>${r.Score}</td></tr>`)
        .join("");
      parts.push(`
        <h3>Por operador</h3>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
          <tr><th>Operador</th><th>Conversas</th><th>Score</th></tr>
          ${rows}
        </table>
      `);
    }

    if (data.sections.instanceStatus) {
      const url = (map.evolution_api_url ?? "").replace(/\/+$/, "");
      const apiKey = map.evolution_api_key ?? "";
      let statusRows = "";
      if (url && apiKey) {
        try {
          const res = await fetch(`${url}/instance/fetchInstances`, {
            headers: { apikey: apiKey, "Content-Type": "application/json" },
          });
          if (res.ok) {
            const arr = (await res.json()) as unknown;
            const list = Array.isArray(arr) ? arr : [];
            statusRows = list
              .map((it) => {
                const o = it as Record<string, unknown>;
                const name = (o.name as string) ?? "—";
                const status = (o.connectionStatus as string) ?? "—";
                const emoji = status === "open" ? "🟢" : "🔴";
                return `<tr><td>${name}</td><td>${emoji} ${status}</td></tr>`;
              })
              .join("");
          }
        } catch {
          // ignore — section just comes up empty below
        }
      }
      parts.push(`
        <h3>Status das instâncias</h3>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
          <tr><th>Instância</th><th>Status</th></tr>
          ${statusRows || '<tr><td colspan="2">Não foi possível obter o status</td></tr>'}
        </table>
      `);
    }

    parts.push(
      `<p style="color:#888;font-size:12px">Gerado automaticamente pelo Solaris Analytics Chat — ${new Date().toLocaleString("pt-BR")}</p>`,
    );

    const { sendEmail } = await import("@/lib/email/resend.server");
    const result = await sendEmail({
      to: recipients,
      subject: `📊 Relatório SAC — ${data.period}`,
      html: parts.join("\n"),
    });

    if (!result.ok) throw new Error(result.error ?? "Falha ao enviar e-mail");
    return { sent: recipients.length, recipients };
  });
