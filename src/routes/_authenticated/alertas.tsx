import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BellRing, Clock, TrendingDown, Users, CheckCircle2, WifiOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings";
import { listConversations, listWebhookHealth, regenerateToken } from "@/lib/operators.functions";
import { listAnalyses } from "@/lib/ai/ai.functions";
import { formatDuration, formatDateTime } from "@/lib/sac/format";

export const Route = createFileRoute("/_authenticated/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas — SAC" },
      { name: "description", content: "Central de alertas em tempo real com regras configuráveis." },
    ],
  }),
  component: AlertasPage,
});

type AlertItem = {
  id: string;
  severity: "high" | "medium" | "info";
  type: "no_response" | "low_score" | "queue_peak";
  title: string;
  description: string;
  conversationId?: string;
  leadName?: string;
  operatorName?: string;
  value: number;
};

const severityStyles = {
  high: {
    border: "border-danger/40",
    bg: "bg-danger/5",
    badge: "bg-danger/15 text-danger",
    icon: "text-danger",
    label: "Crítico",
  },
  medium: {
    border: "border-warning/40",
    bg: "bg-warning/5",
    badge: "bg-warning/15 text-warning",
    icon: "text-warning",
    label: "Atenção",
  },
  info: {
    border: "border-brand/30",
    bg: "bg-brand/5",
    badge: "bg-brand/15 text-brand",
    icon: "text-brand",
    label: "Info",
  },
};

function AlertCard({ alert }: { alert: AlertItem }) {
  const s = severityStyles[alert.severity];
  const Icon = alert.type === "no_response" ? Clock
    : alert.type === "low_score" ? TrendingDown
    : Users;

  return (
    <div className={`flex gap-3 rounded-lg border ${s.border} ${s.bg} p-3`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.icon}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight">{alert.title}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.badge}`}>
            {s.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>
        {alert.operatorName && (
          <p className="mt-1 text-[11px] text-muted-foreground">Operador: <span className="font-medium">{alert.operatorName}</span></p>
        )}
      </div>
    </div>
  );
}

function AlertasPage() {
  const qc = useQueryClient();
  const { rules, setRules } = useSettingsStore();
  const convsFn = useServerFn(listConversations);
  const analysesFn = useServerFn(listAnalyses);
  const healthFn = useServerFn(listWebhookHealth);
  const regenFn = useServerFn(regenerateToken);

  const { data: convs = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => convsFn(),
    refetchInterval: 30_000,
  });
  const { data: analyses = [] } = useQuery({
    queryKey: ["analyses"],
    queryFn: () => analysesFn({ data: {} }),
    refetchInterval: 60_000,
  });
  const { data: health = [] } = useQuery({
    queryKey: ["webhook-health"],
    queryFn: () => healthFn(),
    refetchInterval: 60_000,
  });

  const silentOperators = useMemo(
    () => health.filter((o) => o.status !== "inactive" && o.total24h === 0),
    [health],
  );

  async function handleRegenerate(id: string, name: string) {
    try {
      await regenFn({ data: { id } });
      toast.success(`Token regenerado para ${name}. Atualize o webhook na Evolution.`);
      qc.invalidateQueries({ queryKey: ["webhook-health"] });
      qc.invalidateQueries({ queryKey: ["operators"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao regenerar token");
    }
  }

  const alerts = useMemo<AlertItem[]>(() => {
    const result: AlertItem[] = [];
    const now = Date.now();
    const noResponseMs = rules.noResponseMinutes * 60 * 1000;

    // Última análise por conversa
    const latestByConv = new Map<string, (typeof analyses)[number]>();
    for (const a of analyses) {
      const cur = latestByConv.get(a.conversation_id ?? "");
      if (!cur || new Date(a.analyzed_at ?? a.created_at) > new Date(cur.analyzed_at ?? cur.created_at)) {
        if (a.conversation_id) latestByConv.set(a.conversation_id, a);
      }
    }
    const isEndedByAi = (id: string) => latestByConv.get(id)?.ended === true;

    // Conversas em andamento, excluindo encerradas
    const ongoing = convs.filter(
      (c) => c.status === "ongoing" && !c.ended_at && !isEndedByAi(c.id),
    );

    // 1. Sem resposta por X minutos
    ongoing.forEach((c) => {
      const lastActivity = new Date(c.updated_at ?? c.started_at).getTime();
      const silenceMs = now - lastActivity;
      if (silenceMs >= noResponseMs) {
        const silenceMin = Math.round(silenceMs / 60_000);
        const opName = (c.operators as { name?: string } | null)?.name ?? "—";
        result.push({
          id: `no-resp-${c.id}`,
          severity: silenceMin >= rules.noResponseMinutes * 2 ? "high" : "medium",
          type: "no_response",
          title: `Sem resposta: ${c.lead_name ?? c.lead_phone}`,
          description: `Conversa parada há ${formatDuration(silenceMs / 1000)}. Iniciada em ${formatDateTime(c.started_at)}.`,
          conversationId: c.id,
          leadName: c.lead_name ?? c.lead_phone,
          operatorName: opName,
          value: silenceMin,
        });
      }
    });

    // 2. Score abaixo do mínimo (ignora encerradas)
    convs
      .filter((c) => c.score_sac !== null && c.score_sac < rules.minScore && c.status !== "resolved" && !c.ended_at && !isEndedByAi(c.id))
      .slice(0, 10)

      .forEach((c) => {
        const opName = (c.operators as { name?: string } | null)?.name ?? "—";
        result.push({
          id: `low-score-${c.id}`,
          severity: (c.score_sac ?? 0) < rules.minScore * 0.6 ? "high" : "medium",
          type: "low_score",
          title: `Score baixo: ${c.lead_name ?? c.lead_phone}`,
          description: `Score ${c.score_sac}/100 — abaixo do mínimo de ${rules.minScore}.`,
          conversationId: c.id,
          leadName: c.lead_name ?? c.lead_phone,
          operatorName: opName,
          value: c.score_sac ?? 0,
        });
      });

    // 3. Pico de fila
    if (ongoing.length >= rules.queuePeakThreshold) {
      result.push({
        id: "queue-peak",
        severity: ongoing.length >= rules.queuePeakThreshold * 1.5 ? "high" : "info",
        type: "queue_peak",
        title: `Pico de fila: ${ongoing.length} conversas ativas`,
        description: `Limite configurado: ${rules.queuePeakThreshold}. Considere acionar mais operadores.`,
        value: ongoing.length,
      });
    }

    // 4. IA identificou encerramento (info, últimas 24h)
    const dayAgo = now - 24 * 60 * 60 * 1000;
    for (const a of analyses) {
      if (!a.ended || !a.conversation_id) continue;
      if (new Date(a.analyzed_at ?? a.created_at).getTime() < dayAgo) continue;
      const c = convs.find((x) => x.id === a.conversation_id);
      const lead = c?.lead_name ?? c?.lead_phone ?? "lead";
      result.push({
        id: `ai-ended-${a.id}`,
        severity: "info",
        type: "queue_peak",
        title: `IA identificou encerramento`,
        description: `A IA detectou que a conversa com ${lead} foi encerrada.`,
        conversationId: a.conversation_id,
        leadName: lead,
        value: 0,
      });
    }

    // Ordena: high > medium > info, depois por valor decrescente
    const order = { high: 0, medium: 1, info: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity] || b.value - a.value);
  }, [convs, analyses, rules]);

  return (
    <>
      <AppHeader
        title="Central de alertas"
        subtitle={alerts.length > 0 ? `${alerts.length} alerta${alerts.length > 1 ? "s" : ""} ativo${alerts.length > 1 ? "s" : ""}` : "Sem alertas ativos"}
      />
      <main className="grid flex-1 gap-6 p-4 md:p-6 lg:grid-cols-[1.4fr_1fr]">

        {/* ── Lista de alertas ── */}
        <section className="space-y-4">
          {/* Saúde dos webhooks */}
          <div className={`rounded-lg border p-4 ${silentOperators.length > 0 ? "border-danger/40 bg-danger/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <WifiOff className={`h-4 w-4 ${silentOperators.length > 0 ? "text-danger" : "text-muted-foreground"}`} />
                <h2 className="text-sm font-semibold">Saúde dos webhooks (24h)</h2>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${silentOperators.length > 0 ? "bg-danger/15 text-danger" : "bg-success/15 text-success"}`}>
                {silentOperators.length > 0 ? `${silentOperators.length} sem eventos` : "Todos ativos"}
              </span>
            </div>
            {silentOperators.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Todos os operadores ativos receberam eventos nas últimas 24h.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {silentOperators.map((op) => (
                  <li key={op.id} className="flex items-center justify-between gap-3 rounded-md bg-background/60 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{op.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        Instância: {op.instance_name} · Último evento: {op.last_received_at ? formatDateTime(op.last_received_at) : "nunca"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => handleRegenerate(op.id, op.name)}
                      >
                        <RefreshCw className="h-3 w-3" /> Regerar token
                      </Button>
                      <Button asChild size="sm" className="h-7 bg-brand text-brand-foreground hover:bg-brand-strong text-xs">
                        <Link to="/integracao">Reconectar</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card text-center">
              <CheckCircle2 className="mb-3 h-8 w-8 text-success" />
              <p className="text-sm font-medium">Tudo certo por aqui.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhuma conversa violando as regras configuradas.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => <AlertCard key={a.id} alert={a} />)}
            </div>
          )}
        </section>

        {/* ── Regras ── */}
        <aside className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Regras de alerta</h2>
            <p className="text-xs text-muted-foreground">Persistidas localmente no navegador</p>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <Label htmlFor="nrm">Sem resposta por (min)</Label>
              <Input
                id="nrm"
                type="number"
                min={1}
                value={rules.noResponseMinutes}
                onChange={(e) => setRules({ noResponseMinutes: Number(e.target.value) })}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label htmlFor="ms">Score mínimo aceitável</Label>
              <Input
                id="ms"
                type="number"
                min={0}
                max={100}
                value={rules.minScore}
                onChange={(e) => setRules({ minScore: Number(e.target.value) })}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label htmlFor="qp">Pico de fila (conversas)</Label>
              <Input
                id="qp"
                type="number"
                min={1}
                value={rules.queuePeakThreshold}
                onChange={(e) => setRules({ queuePeakThreshold: Number(e.target.value) })}
                className="mt-1 h-9"
              />
            </div>
            <div className="flex items-center justify-between rounded-md bg-surface p-2">
              <Label htmlFor="ne" className="text-sm font-normal">Notificar por e-mail</Label>
              <Switch id="ne" checked={rules.notifyEmail} onCheckedChange={(v) => setRules({ notifyEmail: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md bg-surface p-2">
              <Label htmlFor="nw" className="text-sm font-normal">Notificar por webhook</Label>
              <Switch id="nw" checked={rules.notifyWebhook} onCheckedChange={(v) => setRules({ notifyWebhook: v })} />
            </div>
          </div>

          <Button
            className="w-full bg-brand text-brand-foreground hover:bg-brand-strong"
            onClick={() => toast.success("Regras de alerta salvas")}
          >
            Salvar regras
          </Button>

          {alerts.length > 0 && (
            <div className="rounded-md bg-surface p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <BellRing className="h-3.5 w-3.5" />
                Resumo
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Críticos</span>
                  <span className="font-medium text-danger">{alerts.filter(a => a.severity === "high").length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Atenção</span>
                  <span className="font-medium text-warning">{alerts.filter(a => a.severity === "medium").length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Info</span>
                  <span className="font-medium text-brand">{alerts.filter(a => a.severity === "info").length}</span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </main>
    </>
  );
}
