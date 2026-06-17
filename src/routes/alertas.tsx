import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BellRing, Clock, TrendingDown, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings";
import { listConversations } from "@/lib/operators.functions";
import { formatDuration, formatDateTime } from "@/lib/sac/format";

export const Route = createFileRoute("/alertas")({
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
  const { rules, setRules } = useSettingsStore();
  const convsFn = useServerFn(listConversations);

  const { data: convs = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => convsFn(),
    refetchInterval: 30_000,
  });

  const alerts = useMemo<AlertItem[]>(() => {
    const result: AlertItem[] = [];
    const now = Date.now();
    const noResponseMs = rules.noResponseMinutes * 60 * 1000;

    // Conversas em andamento
    const ongoing = convs.filter((c) => c.status === "ongoing");

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

    // 2. Score abaixo do mínimo
    convs
      .filter((c) => c.score_sac !== null && c.score_sac < rules.minScore)
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

    // Ordena: high > medium > info, depois por valor decrescente
    const order = { high: 0, medium: 1, info: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity] || b.value - a.value);
  }, [convs, rules]);

  return (
    <>
      <AppHeader
        title="Central de alertas"
        subtitle={alerts.length > 0 ? `${alerts.length} alerta${alerts.length > 1 ? "s" : ""} ativo${alerts.length > 1 ? "s" : ""}` : "Sem alertas ativos"}
      />
      <main className="grid flex-1 gap-6 p-4 md:p-6 lg:grid-cols-[1.4fr_1fr]">

        {/* ── Lista de alertas ── */}
        <section>
          {alerts.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card text-center">
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
