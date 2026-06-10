import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/status-tag";
import { CollaboratorAvatar } from "@/components/collaborator-avatar";
import { useSettingsStore } from "@/stores/settings";
import { useCollaboratorsStore } from "@/stores/collaborators";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Channel } from "@/types/sac";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — SAC" },
      { name: "description", content: "Metas de SLA, score mínimo, gestão de colaboradores e tema da interface." },
      { property: "og:title", content: "Configurações — Solaris Analytics Chat" },
      { property: "og:description", content: "Personalize SLA, threshold de score e equipe." },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { sla, setSla, minScore, setMinScore, theme, setTheme } = useSettingsStore();
  const { items, add, update, remove } = useCollaboratorsStore();
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newChannel, setNewChannel] = useState<Channel>("whatsapp");

  return (
    <>
      <AppHeader title="Configurações" subtitle="Metas, scoring, equipe e preferências" />
      <main className="flex-1 space-y-6 p-4 md:p-6">
        <section id="scoring" className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Metas de SLA por canal (segundos)</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["whatsapp", "chat", "email"] as Channel[]).map((ch) => (
                <div key={ch}>
                  <Label htmlFor={`sla-${ch}`} className="capitalize">{ch === "email" ? "E-mail" : ch}</Label>
                  <Input
                    id={`sla-${ch}`} type="number" min={10}
                    value={sla[ch]}
                    onChange={(e) => setSla({ [ch]: Number(e.target.value) } as never)}
                    className="mt-1 h-9"
                  />
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

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Gestão de colaboradores</h2>
          <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_180px_auto]">
            <Input placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9" />
            <Input placeholder="Cargo" value={newRole} onChange={(e) => setNewRole(e.target.value)} className="h-9" />
            <Select value={newChannel} onValueChange={(v) => setNewChannel(v as Channel)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand-strong"
              onClick={() => {
                if (!newName) return toast.error("Informe o nome");
                add({ name: newName, role: newRole || "Atendente", mainChannel: newChannel });
                setNewName(""); setNewRole("");
                toast.success("Colaborador adicionado");
              }}
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <CollaboratorAvatar name={c.name} size="sm" />
                <Input
                  value={c.name} onChange={(e) => update(c.id, { name: e.target.value })}
                  className="h-8 max-w-48"
                />
                <Input
                  value={c.role} onChange={(e) => update(c.id, { role: e.target.value })}
                  className="h-8 max-w-48"
                />
                <Tag tone="muted" className="capitalize">{c.mainChannel}</Tag>
                <div className="ml-auto">
                  <Button variant="ghost" size="icon" onClick={() => { remove(c.id); toast.success("Colaborador removido"); }}>
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
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
