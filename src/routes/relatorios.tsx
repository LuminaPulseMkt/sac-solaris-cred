import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { CollaboratorPerformanceChart } from "@/components/charts/collaborator-performance-chart";
import { conversations } from "@/mocks/conversations";
import { collaborators } from "@/mocks/collaborators";
import { Download, Mail, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatDuration } from "@/lib/sac/format";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — SAC" },
      { name: "description", content: "Gere relatórios por período, colaborador e canal com exportação em PDF e CSV." },
      { property: "og:title", content: "Relatórios — Solaris Analytics Chat" },
      { property: "og:description", content: "Resumo executivo, funil de conversão e ranking exportáveis." },
    ],
  }),
  component: RelatoriosPage,
});

function exportCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function RelatoriosPage() {
  const [period, setPeriod] = useState("7d");
  const [collab, setCollab] = useState("all");
  const [channel, setChannel] = useState("all");
  const [email, setEmail] = useState("");

  const filtered = conversations.filter((c) => {
    if (collab !== "all" && c.collaboratorId !== collab) return false;
    if (channel !== "all" && c.channel !== channel) return false;
    return true;
  });

  const total = filtered.length;
  const avgScore = total ? Math.round(filtered.reduce((a, c) => a + c.score, 0) / total) : 0;
  const avgResp = total ? filtered.reduce((a, c) => a + c.responseTimeSeconds, 0) / total : 0;
  const convRate = total ? (filtered.filter((c) => c.converted).length / total) * 100 : 0;

  const ranking = collaborators.map((c) => {
    const cs = filtered.filter((x) => x.collaboratorId === c.id);
    const sc = cs.length ? Math.round(cs.reduce((a, x) => a + x.score, 0) / cs.length) : 0;
    return { Colaborador: c.name, Conversas: cs.length, Score: sc };
  }).sort((a, b) => b.Score - a.Score);

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
        <section className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[180px_1fr_1fr_auto]">
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Colaborador</Label>
            <Select value={collab} onValueChange={setCollab}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {collaborators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Canal</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Resumo executivo</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Conversas" value={String(total)} />
            <MetricCard label="Tempo médio" value={formatDuration(avgResp)} />
            <MetricCard label="Conversão" value={`${convRate.toFixed(1)}%`} />
            <MetricCard label="Score médio" value={`${avgScore}/100`} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Análise por colaborador</h2>
          <CollaboratorPerformanceChart />
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Ranking de score</h2>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground">
              <tr><th className="py-2 text-left">Colaborador</th><th className="text-left">Conversas</th><th className="text-right">Score</th></tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.Colaborador} className="border-t border-border">
                  <td className="py-2">{r.Colaborador}</td>
                  <td>{r.Conversas}</td>
                  <td className="text-right font-medium tabular-nums">{r.Score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Agendar envio automático por e-mail</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-56">
              <Label htmlFor="em">E-mail destinatário</Label>
              <Input id="em" type="email" placeholder="nome@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-9" />
            </div>
            <Button onClick={() => { if (!email) return toast.error("Informe um e-mail"); toast.success(`Relatório agendado para ${email}`); }}>
              <Mail className="h-4 w-4" /> Agendar
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
