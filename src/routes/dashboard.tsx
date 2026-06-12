import { createFileRoute, Link } from "@tanstack/react-router";
import { Webhook, MessagesSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { listConversations } from "@/lib/operators.functions";
import { formatDuration } from "@/lib/sac/format";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão geral — SAC" },
      { name: "description", content: "KPIs e desempenho de atendimento em tempo real." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const listFn = useServerFn(listConversations);
  const { data: rows = [] } = useQuery({ queryKey: ["conversations"], queryFn: () => listFn() });

  const total = rows.length;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = rows.filter((c) => new Date(c.started_at) >= todayStart).length;
  const avgResp = total ? rows.reduce((a, c) => a + (c.avg_response_time_s ?? 0), 0) / total : 0;
  const convRate = total ? (rows.filter((c) => c.converted).length / total) * 100 : 0;
  const avgScore = total ? Math.round(rows.reduce((a, c) => a + (c.score_sac ?? 0), 0) / total) : 0;

  const metrics = [
    { label: "Conversas hoje", value: total ? String(today) : "—" },
    { label: "Tempo médio de resposta", value: avgResp ? formatDuration(avgResp) : "—" },
    { label: "Taxa de conversão", value: total ? `${convRate.toFixed(1)}%` : "—" },
    { label: "Score médio SAC", value: total ? `${avgScore}/100` : "—" },
  ];

  return (
    <>
      <AppHeader
        title="Visão geral"
        subtitle="Resumo de atendimento e scoring"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/integracao"><Webhook className="h-4 w-4" /> Integração</Link>
          </Button>
        }
      />

      <main className="flex-1 space-y-6 p-4 md:p-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((m) => <MetricCard key={m.label} {...m} />)}
        </section>

        {total === 0 && (
          <section className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhuma conversa registrada ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Link to="/integracao" className="text-brand hover:underline">Configure o webhook</Link> para começar a receber dados.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
