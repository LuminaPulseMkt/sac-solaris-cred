import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { Download, FileText, FileBarChart } from "lucide-react";
import { toast } from "sonner";
import { listConversations, listOperatorStats } from "@/lib/operators.functions";
import { formatDuration } from "@/lib/sac/format";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — SAC" },
      { name: "description", content: "Relatórios por período, operador e canal." },
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

function RelatoriosPage() {
  const [period, setPeriod] = useState("7d");
  const [operator, setOperator] = useState("all");

  const convsFn = useServerFn(listConversations);
  const statsFn = useServerFn(listOperatorStats);
  const { data: convs = [] } = useQuery({ queryKey: ["conversations"], queryFn: () => convsFn(), refetchInterval: 30_000 });
  const { data: stats = [] } = useQuery({ queryKey: ["operator-stats"], queryFn: () => statsFn(), refetchInterval: 30_000 });

  const filtered = convs.filter((c) => operator === "all" || c.operator_id === operator);
  const total = filtered.length;
  const avgScore = total ? Math.round(filtered.reduce((a, c) => a + (c.score_sac ?? 0), 0) / total) : 0;
  const avgResp = total ? filtered.reduce((a, c) => a + (c.avg_response_time_s ?? 0), 0) / total : 0;
  const convRate = total ? (filtered.filter((c) => c.converted).length / total) * 100 : 0;

  const ranking = stats.map((s) => ({ Operador: s.name, Conversas: s.total, Score: s.avgScore })).sort((a, b) => b.Score - a.Score);

  return (
    <>
      <AppHeader
        title="Relatórios"
        subtitle="Geração de relatórios com filtros e exportação"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportCsv(`sac-${period}.csv`, ranking)}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand-strong" onClick={() => toast.info("Geração de PDF agendada")}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </>
        }
      />

      <main className="flex-1 space-y-6 p-4 md:p-6">
        <section className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[180px_1fr]">
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
