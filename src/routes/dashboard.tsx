import { createFileRoute, Link } from "@tanstack/react-router";
import { Webhook, MessagesSquare, TrendingUp, Clock, Star, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { listConversations, listOperatorStats } from "@/lib/operators.functions";
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

// ─── helpers ────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-danger)";
}

function labelDay(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
}

// ─── Custom tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, unit }: {
  active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string; unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs">
      {label && <p className="mb-1 font-medium text-muted-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <strong>{unit === "s" ? formatDuration(p.value) : unit === "%" ? `${p.value.toFixed(1)}%` : p.value}</strong>
        </p>
      ))}
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

function DashboardPage() {
  const listFn = useServerFn(listConversations);
  const statsFn = useServerFn(listOperatorStats);

  const { data: rows = [] } = useQuery({ queryKey: ["conversations"], queryFn: () => listFn() });
  const { data: opStats = [] } = useQuery({ queryKey: ["operator-stats"], queryFn: () => statsFn() });

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = rows.length;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const today = rows.filter((c) => new Date(c.started_at) >= todayStart).length;
    const avgResp = total ? rows.reduce((a, c) => a + (c.avg_response_time_s ?? 0), 0) / total : 0;
    const convRate = total ? (rows.filter((c) => c.converted).length / total) * 100 : 0;
    const avgScore = total ? Math.round(rows.reduce((a, c) => a + (c.score_sac ?? 0), 0) / total) : 0;
    const activeOps = opStats.filter((o) => o.status === "active").length;
    return { total, today, avgResp, convRate, avgScore, activeOps };
  }, [rows, opStats]);

  // ── Conversas por dia (últimos 7 dias) ───────────────────────────────────
  const convsByDay = useMemo(() => {
    const map: Record<string, { date: string; total: number; resolved: number }> = {};
    const days = 7;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      map[key] = { date: labelDay(d.toISOString()), total: 0, resolved: 0 };
    }
    rows.forEach((c) => {
      const key = c.started_at.slice(0, 10);
      if (map[key]) {
        map[key].total++;
        if (c.status === "resolved") map[key].resolved++;
      }
    });
    return Object.values(map);
  }, [rows]);

  // ── Tempo médio de resposta por dia ──────────────────────────────────────
  const respByDay = useMemo(() => {
    const map: Record<string, { date: string; avg: number; count: number; sum: number }> = {};
    const days = 7;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      map[key] = { date: labelDay(d.toISOString()), avg: 0, count: 0, sum: 0 };
    }
    rows.forEach((c) => {
      const key = c.started_at.slice(0, 10);
      if (map[key] && c.avg_response_time_s) {
        map[key].sum += c.avg_response_time_s;
        map[key].count++;
      }
    });
    return Object.values(map).map((d) => ({ ...d, avg: d.count ? Math.round(d.sum / d.count) : 0 }));
  }, [rows]);

  // ── Score por faixa ───────────────────────────────────────────────────────
  const scoreDist = useMemo(() => {
    const buckets = [
      { label: "0–30", min: 0, max: 30, count: 0 },
      { label: "31–50", min: 31, max: 50, count: 0 },
      { label: "51–70", min: 51, max: 70, count: 0 },
      { label: "71–90", min: 71, max: 90, count: 0 },
      { label: "91–100", min: 91, max: 100, count: 0 },
    ];
    rows.forEach((c) => {
      const s = c.score_sac ?? 0;
      const b = buckets.find((b) => s >= b.min && s <= b.max);
      if (b) b.count++;
    });
    return buckets;
  }, [rows]);

  // ── Status pie ────────────────────────────────────────────────────────────
  const statusPie = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((c) => { map[c.status] = (map[c.status] ?? 0) + 1; });
    const labels: Record<string, string> = { ongoing: "Em andamento", resolved: "Resolvido", escalated: "Escalado" };
    const colors: Record<string, string> = {
      ongoing: "var(--color-brand)",
      resolved: "var(--color-success)",
      escalated: "var(--color-warning)",
    };
    return Object.entries(map).map(([k, v]) => ({ name: labels[k] ?? k, value: v, color: colors[k] ?? "var(--color-muted)" }));
  }, [rows]);

  // ── Top operadores ────────────────────────────────────────────────────────
  const topOps = useMemo(() =>
    [...opStats]
      .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
      .slice(0, 5)
      .map((o) => ({ name: o.name, score: o.avgScore ?? 0, msgs: o.messages_today ?? 0, total: o.total ?? 0 }))
  , [opStats]);

  if (rows.length === 0 && opStats.length === 0) {
    return (
      <>
        <AppHeader
          title="Visão geral"
          subtitle="Resumo de atendimento e scoring"
          actions={<Button variant="outline" size="sm" asChild><Link to="/integracao"><Webhook className="h-4 w-4" /> Integração</Link></Button>}
        />
        <main className="flex-1 p-4 md:p-6">
          <section className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhuma conversa registrada ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Link to="/integracao" className="text-brand hover:underline">Configure o webhook</Link> para começar a receber dados.
            </p>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader
        title="Visão geral"
        subtitle="Resumo de atendimento e scoring"
        actions={<Button variant="outline" size="sm" asChild><Link to="/integracao"><Webhook className="h-4 w-4" /> Integração</Link></Button>}
      />

      <main className="flex-1 space-y-6 p-4 md:p-6">

        {/* ── KPI Cards ──────────────────────────────────────────── */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Conversas hoje"
            value={String(kpis.today)}
            icon={<MessagesSquare className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Tempo médio de resposta"
            value={kpis.avgResp ? formatDuration(kpis.avgResp) : "—"}
            icon={<Clock className="h-3.5 w-3.5" />}
            alert={kpis.avgResp > 600}
          />
          <MetricCard
            label="Score médio SAC"
            value={kpis.total ? `${kpis.avgScore}/100` : "—"}
            icon={<Star className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Operadores ativos"
            value={String(kpis.activeOps)}
            icon={<Users className="h-3.5 w-3.5" />}
          />
        </section>

        {/* ── Row 2: volume + tempo de resposta ─────────────────── */}
        <section className="grid gap-4 lg:grid-cols-2">

          <ChartCard title="Volume de conversas" subtitle="Últimos 7 dias">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={convsByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="total" name="Total" stroke="var(--color-brand)" strokeWidth={2} fill="url(#gradTotal)" dot={{ r: 3, fill: "var(--color-brand)" }} />
                <Area type="monotone" dataKey="resolved" name="Resolvidas" stroke="var(--color-success)" strokeWidth={2} fill="url(#gradResolved)" dot={{ r: 3, fill: "var(--color-success)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Tempo médio de resposta" subtitle="Últimos 7 dias · Meta: 3 min">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={respByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${Math.floor(v / 60)}min`} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip unit="s" />} />
                <ReferenceLine y={180} stroke="var(--color-danger)" strokeDasharray="4 4" label={{ value: "3 min", fill: "var(--color-danger)", fontSize: 10, position: "right" }} />
                <Line type="monotone" dataKey="avg" name="Tempo médio" stroke="var(--color-brand)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-brand)" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

        </section>

        {/* ── Row 3: distribuição score + status + top operadores ── */}
        <section className="grid gap-4 lg:grid-cols-3">

          <ChartCard title="Distribuição de score SAC" subtitle="Por faixa de pontuação">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scoreDist} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Conversas" radius={[4, 4, 0, 0]}>
                  {scoreDist.map((b) => (
                    <Cell key={b.label} fill={scoreColor(b.min + 15)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Status das conversas" subtitle="Distribuição atual">
            {statusPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value">
                    {statusPie.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, "conversas"]} contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">Sem dados</div>
            )}
          </ChartCard>

          <ChartCard title="Top operadores" subtitle="Por score médio SAC">
            {topOps.length > 0 ? (
              <div className="mt-1 space-y-3">
                {topOps.map((op, i) => (
                  <div key={op.name} className="flex items-center gap-3">
                    <span className="w-4 text-[11px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-xs font-medium">{op.name}</span>
                        <span className="ml-2 text-xs tabular-nums font-semibold" style={{ color: scoreColor(op.score) }}>{op.score}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${op.score}%`, background: scoreColor(op.score) }}
                        />
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{op.total} conv · {op.msgs} hoje</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">Sem dados</div>
            )}
          </ChartCard>

        </section>

        {/* ── Row 4: mensagens por operador (bar horizontal) ───────── */}
        {topOps.length > 0 && (
          <section>
            <ChartCard title="Conversas por operador" subtitle="Total acumulado">
              <ResponsiveContainer width="100%" height={Math.max(160, topOps.length * 44)}>
                <BarChart data={topOps} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="total" name="Conversas" fill="var(--color-brand)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>
        )}

      </main>
    </>
  );
}
