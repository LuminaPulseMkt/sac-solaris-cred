import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/settings";
import type { Channel } from "@/types/sac";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — SAC" },
      { name: "description", content: "Metas de SLA, score mínimo e preferências." },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { sla, setSla, minScore, setMinScore, theme, setTheme } = useSettingsStore();

  return (
    <>
      <AppHeader title="Configurações" subtitle="Metas, scoring e preferências" />
      <main className="flex-1 space-y-6 p-4 md:p-6">
        <section id="scoring" className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Metas de SLA por canal (segundos)</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["whatsapp", "chat", "email"] as Channel[]).map((ch) => (
                <div key={ch}>
                  <Label htmlFor={`sla-${ch}`} className="capitalize">{ch === "email" ? "E-mail" : ch}</Label>
                  <Input id={`sla-${ch}`} type="number" min={10} value={sla[ch]}
                    onChange={(e) => setSla({ [ch]: Number(e.target.value) } as never)} className="mt-1 h-9" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Scoring</h2>
            <div className="space-y-3">
              <div>
                <Label htmlFor="ms">Score mínimo aceitável</Label>
                <Input id="ms" type="number" min={0} max={100}
                  value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="mt-1 h-9" />
              </div>
              <p className="text-xs text-muted-foreground">
                Pesos da fórmula: tempo 40% · resolução 35% · conversão 25%
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Notificações</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-md bg-surface p-2">
                <Label className="font-normal">E-mail (resumo diário)</Label><Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-md bg-surface p-2">
                <Label className="font-normal">Webhook (eventos críticos)</Label><Switch />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Tema</h2>
            <Select value={theme} onValueChange={(v) => setTheme(v as "light" | "dark")}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>
      </main>
    </>
  );
}
