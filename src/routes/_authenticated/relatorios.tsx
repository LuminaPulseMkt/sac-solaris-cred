import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/metric-card";
import { Download, FileText, FileBarChart, MessageSquare, Loader2, Sparkles, ChevronDown, ChevronUp, Mail } from "lucide-react";
import { toast } from "sonner";
import { listConversations, listOperatorStats } from "@/lib/operators.functions";
import { listAnalyses, getOperatorAiReport, analyzeAllPending } from "@/lib/ai/ai.functions";
import { getSettings } from "@/lib/settings/settings.functions";
import { sendReportViaWhatsapp } from "@/lib/reports/whatsapp.functions";
import { sendReportViaEmail } from "@/lib/reports/email.functions";
import { generateReportPdf, type ReportAnalysisSummary } from "@/lib/reports/generate-pdf";
import { formatDuration } from "@/lib/sac/format";


export const Route = createFileRoute("/_authenticated/relatorios")({
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
  const qc = useQueryClient();
  const [period, setPeriod] = useState("7d");
  const [operator, setOperator] = useState("all");
  const [includeAi, setIncludeAi] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSections, setEmailSections] = useState({ general: true, perOperator: true, instanceStatus: true });
  const [analyzing, setAnalyzing] = useState(false);

  const convsFn = useServerFn(listConversations);
  const statsFn = useServerFn(listOperatorStats);
  const analysesFn = useServerFn(listAnalyses);
  const settingsFn = useServerFn(getSettings);
  const sendFn = useServerFn(sendReportViaWhatsapp);
  const sendEmailFn = useServerFn(sendReportViaEmail);
  const reportFn = useServerFn(getOperatorAiReport);
  const analyzeFn = useServerFn(analyzeAllPending);

  const { data: convs = [] } = useQuery({ queryKey: ["conversations"], queryFn: () => convsFn(), refetchInterval: 30_000 });
  const { data: stats = [] } = useQuery({ queryKey: ["operator-stats"], queryFn: () => statsFn(), refetchInterval: 30_000 });
  const { data: analyses = [] } = useQuery({ queryKey: ["analyses"], queryFn: () => analysesFn({ data: {} }), refetchInterval: 60_000 });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => settingsFn() });
  const { data: aiReport } = useQuery({
    queryKey: ["ai-report", period, operator],
    queryFn: () =>
      reportFn({
        data: {
          period: (period === "24h" || period === "7d" || period === "30d" ? period : "7d") as "24h" | "7d" | "30d" | "all",
          operator_id: operator !== "all" ? operator : undefined,
        },
      }),
    refetchInterval: 60_000,
  });

  const handleAnalyzeAll = async () => {
    setAnalyzing(true);
    try {
      const r = await analyzeFn({ data: { operator_id: operator !== "all" ? operator : undefined } });
      if (r.firstError) {
        toast.error("Erro na análise: " + r.firstError);
      } else {
        toast.success(`${r.analyzed} conversas analisadas${r.failed ? `, ${r.failed} falhas` : ""}`);
      }
      qc.invalidateQueries({ queryKey: ["analyses"] });
      qc.invalidateQueries({ queryKey: ["ai-report"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setAnalyzing(false);
    }
  };


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

  const sendEmailReport = async () => {
    if (!emailSections.general && !emailSections.perOperator && !emailSections.instanceStatus) {
      return toast.error("Selecione ao menos uma seção para enviar");
    }
    setSendingEmail(true);
    try {
      const periodLabel = { "24h": "Últimas 24h", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias" }[period] ?? period;
      const res = await sendEmailFn({
        data: {
          period: periodLabel,
          sections: emailSections,
          metrics: { total, avgScore, avgResponseTime: avgResp, conversionRate: convRate },
          ranking,
        },
      });
      toast.success(`E-mail enviado para ${res.sent} destinatário(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar e-mail");
    } finally {
      setSendingEmail(false);
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

      <main className="flex-1 space-y-4 p-4 md:p-6">
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

        <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-3">
          <span className="text-xs font-medium text-muted-foreground">📧 Enviar por e-mail:</span>
          <div className="flex items-center gap-2">
            <Switch
              checked={emailSections.general}
              onCheckedChange={(v) => setEmailSections((s) => ({ ...s, general: v }))}
              id="secGeneral"
            />
            <Label htmlFor="secGeneral" className="text-xs">Resumo geral</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={emailSections.perOperator}
              onCheckedChange={(v) => setEmailSections((s) => ({ ...s, perOperator: v }))}
              id="secOperator"
            />
            <Label htmlFor="secOperator" className="text-xs">Por operador</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={emailSections.instanceStatus}
              onCheckedChange={(v) => setEmailSections((s) => ({ ...s, instanceStatus: v }))}
              id="secInstances"
            />
            <Label htmlFor="secInstances" className="text-xs">Status das instâncias</Label>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={sendEmailReport}
            disabled={sendingEmail}
          >
            {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Enviar por e-mail
          </Button>
        </section>

        <Tabs defaultValue="geral">
          <TabsList>
            <TabsTrigger value="geral">Visão Geral</TabsTrigger>
            <TabsTrigger value="operadores">Por Operador</TabsTrigger>
            <TabsTrigger value="ia">✨ Análise IA</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="space-y-6 mt-4">
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
          </TabsContent>

          <TabsContent value="operadores" className="mt-4">
            <OperatorReportTab
              stats={stats}
              metrics={aiReport?.operatorMetrics ?? []}
              analyzing={analyzing}
              onAnalyzeAll={handleAnalyzeAll}
            />
          </TabsContent>

          <TabsContent value="ia" className="mt-4">
            <AiReportTab
              aiReport={aiReport}
              analyzing={analyzing}
              onAnalyzeAll={handleAnalyzeAll}
            />
          </TabsContent>
        </Tabs>
      </main>
    </>

  );
}

type OperatorMetric = {
  operator_id: string;
  total_analyzed: number | null;
  total_ended: number | null;
  avg_quality_score: number | null;
  sentiment_positive: number | null;
  sentiment_neutral: number | null;
  sentiment_negative: number | null;
  top_topics: unknown;
  top_improvements: unknown;
};

type OpStat = {
  id: string;
  name: string;
  total: number;
  avgScore: number;
  avgResp: number;
  convRate: number;
};

function OperatorReportTab({
  stats,
  metrics,
  analyzing,
  onAnalyzeAll,
}: {
  stats: OpStat[];
  metrics: OperatorMetric[];
  analyzing: boolean;
  onAnalyzeAll: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Métricas consolidadas pela IA por operador</p>
        <Button size="sm" variant="outline" onClick={onAnalyzeAll} disabled={analyzing}>
          {analyzing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
          Analisar pendentes
        </Button>
      </div>

      {stats.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Sem operadores cadastrados.</div>
      ) : (
        stats.map((op) => {
          const m = metrics.find((x) => x.operator_id === op.id);
          return <OperatorAiCard key={op.id} op={op} m={m} />;
        })
      )}
    </div>
  );
}

function OperatorAiCard({ op, m }: { op: OpStat; m?: OperatorMetric }) {
  const [open, setOpen] = useState(false);
  const totalAi = m?.total_analyzed ?? 0;
  const aiScore = m?.avg_quality_score != null ? Math.round(Number(m.avg_quality_score)) : null;
  const totalSent = (m?.sentiment_positive ?? 0) + (m?.sentiment_neutral ?? 0) + (m?.sentiment_negative ?? 0);
  const pct = (n: number) => (totalSent ? Math.round((n / totalSent) * 100) : 0);
  const topics = Array.isArray(m?.top_topics) ? (m!.top_topics as Array<{ topic: string; count: number }>) : [];
  const imps = Array.isArray(m?.top_improvements) ? (m!.top_improvements as Array<{ text: string; count: number }>) : [];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <div className="font-semibold">{op.name}</div>
          <div className="text-xs text-muted-foreground">
            {op.total} conversas · Tempo médio {formatDuration(op.avgResp)}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Badge variant="secondary">SAC {op.avgScore}</Badge>
          <Badge variant="secondary">IA {aiScore ?? "—"}</Badge>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
          {totalAi === 0 ? (
            <p className="text-muted-foreground">Nenhuma análise de IA para este operador ainda.</p>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                Sentimento: 😊 {pct(m?.sentiment_positive ?? 0)}% · 😐 {pct(m?.sentiment_neutral ?? 0)}% · 😞 {pct(m?.sentiment_negative ?? 0)}%
              </div>
              <div className="text-xs text-muted-foreground">
                Encerradas pela IA: {m?.total_ended ?? 0} de {totalAi}
              </div>
              {topics.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">Tópicos mais abordados</div>
                  <div className="flex flex-wrap gap-1">
                    {topics.slice(0, 6).map((t) => (
                      <Badge key={t.topic} variant="secondary">{t.topic} · {t.count}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {imps.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">💡 Top melhorias sugeridas</div>
                  <ol className="list-decimal pl-5 space-y-0.5 text-sm">
                    {imps.map((i, idx) => (
                      <li key={idx}>{i.text} <span className="text-muted-foreground">({i.count}x)</span></li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type AiReport = {
  total: number;
  avgQualityScore: number;
  ended: number;
  ongoing: number;
  sentiments: { positive: number; neutral: number; negative: number };
  topTopics: Array<{ topic: string; count: number }>;
  topImprovements: Array<{ text: string; count: number }>;
  analyses: Array<{
    id: string;
    quality_score: number | null;
    sentiment: string | null;
    ended: boolean | null;
    analyzed_at: string | null;
    operators?: { name?: string } | null;
  }>;
};

function AiReportTab({
  aiReport,
  analyzing,
  onAnalyzeAll,
}: {
  aiReport: AiReport | undefined;
  analyzing: boolean;
  onAnalyzeAll: () => void;
}) {
  const total = aiReport?.total ?? 0;
  const s = aiReport?.sentiments;
  const predominant = s
    ? s.positive >= s.neutral && s.positive >= s.negative
      ? "😊 Positivo"
      : s.negative > s.positive
        ? "😞 Negativo"
        : "😐 Neutro"
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total > 0 ? `${total} conversas analisadas no período` : "Nenhuma análise no período"}
        </p>
        <Button size="sm" onClick={onAnalyzeAll} disabled={analyzing}>
          {analyzing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
          Analisar pendentes
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Analisadas" value={total ? String(total) : "—"} />
        <MetricCard label="Score médio IA" value={total ? `${aiReport!.avgQualityScore}/100` : "—"} />
        <MetricCard label="Encerradas (IA)" value={total ? String(aiReport!.ended) : "—"} />
        <MetricCard label="Sentimento" value={total ? predominant : "—"} />
      </div>

      {total > 0 && aiReport && (
        <>
          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Tópicos mais abordados</h3>
            {aiReport.topTopics.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {aiReport.topTopics.map((t) => (
                  <Badge key={t.topic} variant="secondary">{t.topic} · {t.count}</Badge>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">💡 Top melhorias sugeridas</h3>
            {aiReport.topImprovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ol className="list-decimal pl-5 space-y-1 text-sm">
                {aiReport.topImprovements.map((i, idx) => (
                  <li key={idx}>{i.text} <span className="text-muted-foreground">({i.count} conversas)</span></li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Análises recentes</h3>
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Operador</th>
                  <th className="text-left">Score IA</th>
                  <th className="text-left">Sentimento</th>
                  <th className="text-left">Encerrada</th>
                  <th className="text-right">Data</th>
                </tr>
              </thead>
              <tbody>
                {aiReport.analyses.slice(0, 20).map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-2">{a.operators?.name ?? "—"}</td>
                    <td>{a.quality_score ?? "—"}</td>
                    <td>{a.sentiment ?? "—"}</td>
                    <td>{a.ended ? "Sim" : "Não"}</td>
                    <td className="text-right text-muted-foreground">
                      {a.analyzed_at ? new Date(a.analyzed_at).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

