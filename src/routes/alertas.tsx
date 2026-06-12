import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { BellRing } from "lucide-react";
import { useSettingsStore } from "@/stores/settings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas — SAC" },
      { name: "description", content: "Central de alertas em tempo real com regras configuráveis." },
    ],
  }),
  component: AlertasPage,
});

function AlertasPage() {
  const { rules, setRules } = useSettingsStore();

  return (
    <>
      <AppHeader title="Central de alertas" subtitle="Eventos em tempo real" />
      <main className="grid flex-1 gap-6 p-4 md:p-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <BellRing className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhum alerta ativo.</p>
          <p className="mt-1 text-xs text-muted-foreground">Alertas aparecerão aqui conforme as regras configuradas.</p>
        </section>

        <aside className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Regras de alerta</h2>
            <p className="text-xs text-muted-foreground">Ajustes aplicados localmente nesta sessão</p>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <Label htmlFor="nrm">Sem resposta por (min)</Label>
              <Input id="nrm" type="number" min={1} value={rules.noResponseMinutes}
                onChange={(e) => setRules({ noResponseMinutes: Number(e.target.value) })} className="mt-1 h-9" />
            </div>
            <div>
              <Label htmlFor="ms">Score mínimo aceitável</Label>
              <Input id="ms" type="number" min={0} max={100} value={rules.minScore}
                onChange={(e) => setRules({ minScore: Number(e.target.value) })} className="mt-1 h-9" />
            </div>
            <div>
              <Label htmlFor="qp">Pico de fila (conversas)</Label>
              <Input id="qp" type="number" min={1} value={rules.queuePeakThreshold}
                onChange={(e) => setRules({ queuePeakThreshold: Number(e.target.value) })} className="mt-1 h-9" />
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

          <Button className="w-full bg-brand text-brand-foreground hover:bg-brand-strong" onClick={() => toast.success("Regras de alerta salvas")}>
            Salvar regras
          </Button>
        </aside>
      </main>
    </>
  );
}
