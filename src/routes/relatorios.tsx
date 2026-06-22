import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { Download, FileText, FileBarChart, MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listConversations, listOperatorStats } from "@/lib/operators.functions";
import { listAnalyses } from "@/lib/ai/ai.functions";
import { getSettings } from "@/lib/settings/settings.functions";
import { sendReportViaWhatsapp } from "@/lib/reports/whatsapp.functions";
import { generateReportPdf, type ReportAnalysisSummary } from "@/lib/reports/generate-pdf";
import { formatDuration } from "@/lib/sac/format";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — SAC" },
      { name: "description", content: "Relatórios com PDF e envio via WhatsApp." },
    ],
  }),
  component: RelatoriosPage,
});

function exportCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return toast.error("Sem dados para exportar");
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function summarizeAnalyses(rows: Array<{
  quality_score: number | null;
  sentiment: string | null;
  topics: unknown;
  improvements: unknown;
}>): ReportAnalysisSummary | null {
  if (rows.length === 0) return null;
  const scores = rows.map((r) => r.quality_score ?? 0);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const sent = { positive: 0, neutral: 0, negative: 0 };
  for (const r of rows) {
    const s = (r.sentiment ?? "neutral") as keyof typeof sent;
    if (s in sent) sent[s]++;
  }
  const topicCounts = new Map<string, number>();
  const impCounts = new Map<string, number>();
  for (const r of rows) {
    (Array.isArray(r.topics) ? (r.topics as string[]) : []).forEach((t) =>
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1),
    );
    (Array.isArray(r.improvements) ? (r.improvements as string[]) : []).forEach((t) =>
      impCounts.set(t, (impCounts.get(t) ?? 0) + 1),
    );
  }
  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    averageScore: avg,
    sentimentCounts: sent,
    topTopics: sortDesc(topicCounts).map(([topic, count]) => ({ topic, count })),
    topImprovements: sortDesc(impCounts).map(([text, count]) => ({ text, count })),
  };
}

function RelatoriosPage() {
  const [period, setPeriod] = useState("7d");
  const [operator, setOperator] = useState("all");
  const [includeAi, setIncludeAi] = useState(true);
  const [sending, setSending] = useState(false);

  const convsFn = useServerFn(listConversations);
  const statsFn = useServerFn(listOperatorStats);
  const analysesFn = useServerFn(listAnalyses);
  const settingsFn = useServerFn(getSettings);
  const sendFn = useServerFn(sendReportViaWhatsapp);

  const { data: convs = [] } = useQuery({ queryKey: ["conversations"], queryFn: () => convsFn(), refetchInterval: 30_000 });
  const { data: stats = [] } = useQuery({ queryKey: ["operator-stats"], queryFn: () => statsFn(), refetchInterval: 30_000 });
  const { data: analyses = [] } = useQuery({ queryKey: ["analyses"], queryFn: () => analysesFn({ data: {} }), refetchInterval: 60_000 });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => settingsFn() });

  const cutoff = useMemo(() => {
    const d = new Date();
    if (period === "24h") d.setHours(d.getHours() - 24);
    else if (period === "7d") d.setDate(d.getDate() - 7);
    else if (period === "30d") d.setDate(d.getDate() - 30);
    return d;
  }, [period]);

  const filtered = convs.filter((c) => {
    const matchesPeriod = new Date(c.started_at) >= cutoff;
    const matchesOp = operator === "all" || c.operator_id === operator;
    return matchesPeriod && matchesOp;
  });
  const total = filtered.length;
  const avgScore = total ? Math.round(filtered.reduce((a, c) => a + (c.score_sac ?? 0), 0) / total) : 0;
  const avgResp = total ? filtered.reduce((a, c) => a + (c.avg_response_time_s ?? 0), 0) / total : 0;
  const convRate = total ? (filtered.filter((c) => c.converted).length / total) * 100 : 0;

  const periodAnalyses = analyses.filter((a) => {
    const t = new Date(a.analyzed_at ?? a.created_at).getTime();
    return t >= cutoff.getTime() && (operator === "all" || a.operator_id === operator);
  });
  const aiSummary = summarizeAnalyses(periodAnalyses);

  const ranking = stats
    .map((s) => ({ Operador: s.name, Conversas: s.total, Score: s.avgScore }))
    .sort((a, b) => b.Score - a.Score);

  const numbers: Array<{ number: string; label?: string }> = (() => {
    try { return JSON.parse(settings?.values.report_whatsapp_numbers || "[]"); } catch { return []; }
  })();
  const whatsappReady = numbers.length > 0 && Boolean(settings?.values.report_evolution_instance);

  const buildPdf = () => {
    const opMap = new Map(stats.map((s) => [s.id, s.name]));
    const analysisByConv = new Map(periodAnalyses.map((a) => [a.conversation_id, a]));
    return generateReportPdf({
      period: { "24h": "Últimas 24h", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias" }[period] ?? period,
      operatorFilter: operator === "all" ? "Todos" : opMap.get(operator) ?? operator,
      metrics: { total, avgScore, avgResponseTime: avgResp, conversionRate: convRate },
      ranking: stats.map((s) => ({
        operator: s.name,
        conversations: s.total,
        avgScore: s.avgScore,
        avgRespS: s.avgResp,
        convRate: s.convRate,
      })),
      conversations: filtered.map((c) => {
        const a = analysisByConv.get(c.id);
        return {
          id: c.id,
          operatorName: (c as unknown as { operators?: { name?: string } }).operators?.name ?? "—",
          leadName: c.lead_name ?? c.lead_phone,
          startedAt: c.started_at,
          totalMessages: c.total_messages,
          avgResponseTimeS: c.avg_response_time_s,
          scoreSac: c.score_sac,
          scoreAi: a?.quality_score ?? null,
          status: c.status,
          converted: c.converted,
        };
      }),
      aiSummary,
      includeAi: includeAi && Boolean(aiSummary),
      includeTable: (settings?.values.report_include_table ?? "true") === "true",
    });
  };

  const downloadPdf = () => {
    if (total === 0) return toast.error("Sem dados no período");
    const { blob, filename } = buildPdf();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const sendWhatsapp = async () => {
    if (!whatsappReady) return toast.error("Configure números e instância em Configurações → Relatórios & WhatsApp");
    if (total === 0) return toast.error("Sem dados no período");
    setSending(true);
    try {
      const { base64, filename } = buildPdf();
      const res = await sendFn({
        data: {
          pdfBase64: base64,
          fileName: filename,
          period,
          metrics: { total, avgScore, avgResponseTime: avgResp, conversionRate: convRate },
        },
      });
      toast.success(`Enviado para ${res.sent} de ${res.sent + res.failed} números`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <AppHeader
        title="Relatórios"
        subtitle="PDF, CSV e envio via WhatsApp"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportCsv(`sac-${period}.csv`, ranking)}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" onClick={downloadPdf}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button
              size="sm"
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={sendWhatsapp}
              disabled={sending || !whatsappReady}
              title={!whatsappReady ? "Configure números em Configurações → Relatórios & WhatsApp" : ""}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              WhatsApp
            </Button>
          </>
        }
      />

      <main className="flex-1 space-y-6 p-4 md:p-6">
        <section className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[180px_1fr_auto]">
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Operador</Label>
            <Select value={operator} onValueChange={setOperator}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {stats.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Switch checked={includeAi} onCheckedChange={setIncludeAi} id="incAi" />
            <Label htmlFor="incAi" className="text-xs">Incluir IA no PDF</Label>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Resumo executivo</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Conversas" value={total ? String(total) : "—"} />
            <MetricCard label="Tempo médio" value={avgResp ? formatDuration(avgResp) : "—"} />
            <MetricCard label="Conversão" value={total ? `${convRate.toFixed(1)}%` : "—"} />
            <MetricCard label="Score médio" value={total ? `${avgScore}/100` : "—"} />
          </div>
        </section>

        {aiSummary && (
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">✨ Insights da IA</h2>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Score médio IA</div>
                <div className="text-lg font-semibold">{aiSummary.averageScore}/100</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Sentimento</div>
                <div className="text-sm">
                  😊 {aiSummary.sentimentCounts.positive} · 😐 {aiSummary.sentimentCounts.neutral} · 😞 {aiSummary.sentimentCounts.negative}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground mb-1">Top tópicos</div>
                <div className="flex flex-wrap gap-1">
                  {aiSummary.topTopics.slice(0, 3).map((t) => (
                    <Badge key={t.topic} variant="secondary">{t.topic} · {t.count}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Ranking de score por operador</h2>
          {ranking.length === 0 ? (
            <div className="py-12 text-center">
              <FileBarChart className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Sem dados para exibir.</p>
              <p className="mt-1 text-xs text-muted-foreground">Cadastre operadores e receba conversas pelo webhook.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-muted-foreground">
                <tr><th className="py-2 text-left">Operador</th><th className="text-left">Conversas</th><th className="text-right">Score</th></tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.Operador} className="border-t border-border">
                    <td className="py-2">{r.Operador}</td>
                    <td>{r.Conversas}</td>
                    <td className="text-right font-medium tabular-nums">{r.Score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
