import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Webhook } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { AlertItem } from "@/components/alert-item";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { CollaboratorPerformanceChart } from "@/components/charts/collaborator-performance-chart";
import { ChannelBadge } from "@/components/channel-badge";
import { ScoreBar } from "@/components/score-bar";
import { StatusTag } from "@/components/status-tag";
import { CollaboratorAvatar } from "@/components/collaborator-avatar";
import { ConversationDetailDialog } from "@/components/conversation-detail-dialog";
import { dashboardMetrics } from "@/mocks/metrics";
import { alerts } from "@/mocks/alerts";
import { conversations } from "@/mocks/conversations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Conversation } from "@/types/sac";
import { formatDuration } from "@/lib/sac/format";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão geral — SAC" },
      { name: "description", content: "Acompanhe métricas, alertas e desempenho de conversas em tempo real." },
      { property: "og:title", content: "Visão geral — Solaris Analytics Chat" },
      { property: "og:description", content: "KPIs, tempo de resposta, conversão e score SAC em um único painel." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<string>("all");
  const [scoreBucket, setScoreBucket] = useState<string>("all");
  const [selected, setSelected] = useState<Conversation | null>(null);

  const filtered = conversations.filter((c) => {
    if (channel !== "all" && c.channel !== channel) return false;
    if (scoreBucket === "high" && c.score < 80) return false;
    if (scoreBucket === "medium" && (c.score < 50 || c.score >= 80)) return false;
    if (scoreBucket === "low" && c.score >= 50) return false;
    if (search && !c.customerName.toLowerCase().includes(search.toLowerCase()) && !c.collaboratorName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).slice(0, 8);

  return (
    <>
      <AppHeader
        title="Visão geral"
        subtitle="Resumo de atendimento, scoring e alertas do dia"
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/integracao"><Webhook className="h-4 w-4" /> Configurar n8n</Link>
            </Button>
            <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand-strong">
              <Download className="h-4 w-4" /> Exportar relatório
            </Button>
          </>
        }
      />

      <main className="flex-1 space-y-6 p-4 md:p-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardMetrics.map((m) => (
            <MetricCard key={m.label} {...m} />
          ))}
        </section>

        <section id="tempo" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Tempo de resposta por hora</h2>
                <p className="text-xs text-muted-foreground">Meta de 3 min destacada em vermelho tracejado</p>
              </div>
            </div>
            <ResponseTimeChart />
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Alertas ativos</h2>
              <Link to="/alertas" className="text-xs text-brand hover:underline">Ver todos</Link>
            </div>
            <div className="space-y-2">
              {alerts.slice(0, 4).map((a) => <AlertItem key={a.id} alert={a} />)}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold">Conversas auditadas</h2>
            <Input
              placeholder="Buscar por nome…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48"
            />
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Canal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>
            <Select value={scoreBucket} onValueChange={setScoreBucket}>
              <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Score" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os scores</SelectItem>
                <SelectItem value="high">Alto (≥80)</SelectItem>
                <SelectItem value="medium">Médio (50–79)</SelectItem>
                <SelectItem value="low">Baixo (&lt;50)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CollaboratorAvatar name={c.collaboratorName} score={c.score} size="sm" />
                        <span className="text-sm">{c.collaboratorName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.customerName}</TableCell>
                    <TableCell><ChannelBadge channel={c.channel} /></TableCell>
                    <TableCell className="text-sm tabular-nums">{formatDuration(c.responseTimeSeconds)}</TableCell>
                    <TableCell><ScoreBar score={c.score} /></TableCell>
                    <TableCell><StatusTag status={c.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(c)}>Detalhes</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section id="conversao" className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Conversão e score por colaborador — semana</h2>
          <CollaboratorPerformanceChart />
        </section>
      </main>

      <ConversationDetailDialog conversation={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
