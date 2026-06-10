import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { CollaboratorAvatar } from "@/components/collaborator-avatar";
import { CollaboratorHistoryChart } from "@/components/charts/collaborator-history-chart";
import { Tag } from "@/components/status-tag";
import { collaborators } from "@/mocks/collaborators";
import { conversations } from "@/mocks/conversations";
import { formatDuration, channelLabel } from "@/lib/sac/format";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

export const Route = createFileRoute("/colaboradores")({
  head: () => ({
    meta: [
      { title: "Colaboradores — SAC" },
      { name: "description", content: "Desempenho individual, ranking semanal e histórico de scoring por colaborador." },
      { property: "og:title", content: "Colaboradores — Solaris Analytics Chat" },
      { property: "og:description", content: "Métricas de cada atendente, ranking e evolução semanal." },
    ],
  }),
  component: ColaboradoresPage,
});

function ColaboradoresPage() {
  const stats = collaborators.map((c) => {
    const cs = conversations.filter((x) => x.collaboratorId === c.id);
    const total = cs.length;
    const avgScore = total ? Math.round(cs.reduce((a, x) => a + x.score, 0) / total) : 0;
    const avgResp = total ? cs.reduce((a, x) => a + x.responseTimeSeconds, 0) / total : 0;
    const convRate = total ? (cs.filter((x) => x.converted).length / total) * 100 : 0;
    return { ...c, total, avgScore, avgResp, convRate };
  });

  const ranking = [...stats].sort((a, b) => b.avgScore - a.avgScore);

  return (
    <>
      <AppHeader title="Colaboradores" subtitle="Desempenho individual e ranking semanal" />
      <main className="flex-1 space-y-6 p-4 md:p-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stats.map((c) => (
            <article key={c.id} className="rounded-lg border border-border bg-card p-4">
              <header className="flex items-center gap-3">
                <CollaboratorAvatar name={c.name} score={c.avgScore} size="lg" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold">{c.name}</h3>
                  <p className="text-xs text-muted-foreground">{c.role} · {channelLabel[c.mainChannel]}</p>
                </div>
                <Tag tone={c.avgScore >= 80 ? "success" : c.avgScore >= 50 ? "warning" : "danger"}>
                  {c.avgScore}/100
                </Tag>
              </header>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded bg-surface p-2">
                  <dt className="text-[10px] uppercase text-muted-foreground">Conversas</dt>
                  <dd className="text-base font-medium tabular-nums">{c.total}</dd>
                </div>
                <div className="rounded bg-surface p-2">
                  <dt className="text-[10px] uppercase text-muted-foreground">Tempo médio</dt>
                  <dd className="text-base font-medium tabular-nums">{formatDuration(c.avgResp)}</dd>
                </div>
                <div className="rounded bg-surface p-2">
                  <dt className="text-[10px] uppercase text-muted-foreground">Conversão</dt>
                  <dd className="text-base font-medium tabular-nums">{c.convRate.toFixed(0)}%</dd>
                </div>
              </dl>
              <div className="mt-3">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Histórico de score (8 semanas)</p>
                <CollaboratorHistoryChart collaboratorId={c.id} />
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Ranking semanal</h2>
          <ol className="divide-y divide-border">
            {ranking.map((c, i) => {
              const trend = i % 3 === 0 ? "up" : i % 3 === 1 ? "down" : "same";
              return (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 text-center text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}º</span>
                  <CollaboratorAvatar name={c.name} score={c.avgScore} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.role}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{c.avgScore}</span>
                  <span className="ml-2 inline-flex items-center text-xs">
                    {trend === "up" && <ArrowUp className="h-3.5 w-3.5 text-success" />}
                    {trend === "down" && <ArrowDown className="h-3.5 w-3.5 text-danger" />}
                    {trend === "same" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </>
  );
}
