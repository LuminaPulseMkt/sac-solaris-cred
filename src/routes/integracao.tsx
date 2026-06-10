import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tag } from "@/components/status-tag";
import { webhookConfig as seed, syncLogs } from "@/mocks/webhook-config";
import { Check, RefreshCw, Webhook, X } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/sac/format";

export const Route = createFileRoute("/integracao")({
  head: () => ({
    meta: [
      { title: "Integração n8n — SAC" },
      { name: "description", content: "Configure o webhook n8n, mapeamento de campos e acompanhe sincronizações." },
      { property: "og:title", content: "Integração n8n — Solaris Analytics Chat" },
      { property: "og:description", content: "Webhook URL, mapeamento e logs de sincronização do SAC." },
    ],
  }),
  component: IntegracaoPage,
});

const samplePayload = `{
  "conversation_id": "string",
  "collaborator": { "id": "string", "name": "string" },
  "customer": { "name": "string", "channel": "whatsapp | chat | email" },
  "messages": [
    { "from": "collaborator | customer", "text": "string", "timestamp": "ISO8601" }
  ],
  "started_at": "ISO8601",
  "ended_at": "ISO8601",
  "converted": true,
  "status": "resolved | ongoing | escalated"
}`;

function IntegracaoPage() {
  const [url, setUrl] = useState(seed.url);
  const [connected, setConnected] = useState(seed.connected);
  const [mapping, setMapping] = useState(seed.fieldMapping);

  return (
    <>
      <AppHeader title="Integração n8n" subtitle="Recebimento de conversas via webhook" />
      <main className="flex-1 space-y-6 p-4 md:p-6">
        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold">Configuração do webhook</h2>
              </div>
              {connected ? (
                <Tag tone="success" className="gap-1"><Check className="h-3 w-3" /> Conectado</Tag>
              ) : (
                <Tag tone="danger" className="gap-1"><X className="h-3 w-3" /> Desconectado</Tag>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="url">URL do webhook n8n</Label>
                <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} className="mt-1 h-9 font-mono text-xs" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { setConnected(true); toast.success("Conexão testada com sucesso"); }}>
                  Testar conexão
                </Button>
                <Button variant="outline" onClick={() => toast.success("Sincronização manual iniciada")}>
                  <RefreshCw className="h-4 w-4" /> Sincronizar agora
                </Button>
                <Button variant="ghost" onClick={() => setConnected(false)}>Desconectar</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Endpoint esperado pelo SAC: <code className="rounded bg-surface px-1 py-0.5">POST /api/webhook/n8n</code>
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Payload esperado</h2>
            <pre className="max-h-72 overflow-auto rounded-md bg-surface p-3 text-[11px] leading-relaxed text-foreground">{samplePayload}</pre>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Mapeamento de campos</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(mapping).map(([from, to]) => (
              <div key={from} className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-surface px-2 py-1 text-xs">{from}</code>
                <span className="text-xs text-muted-foreground">→</span>
                <Input value={to} onChange={(e) => setMapping((m) => ({ ...m, [from]: e.target.value }))} className="h-8 flex-1 text-xs" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Log de sincronizações</h2>
          <ul className="divide-y divide-border text-sm">
            {syncLogs.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  {s.status === "success"
                    ? <Tag tone="success" className="gap-1"><Check className="h-3 w-3" />Sucesso</Tag>
                    : <Tag tone="danger" className="gap-1"><X className="h-3 w-3" />Erro</Tag>}
                  <span className="text-xs text-muted-foreground">{formatDateTime(s.syncedAt)}</span>
                  {s.message && <span className="text-xs text-danger">— {s.message}</span>}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{s.recordsImported} registros</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
