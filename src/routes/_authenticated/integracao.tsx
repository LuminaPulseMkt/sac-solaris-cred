import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, RefreshCw, Trash2, Webhook, FlaskConical, Eye, Pencil } from "lucide-react";
import {
  listOperators,
  createOperator,
  updateOperator,
  regenerateToken,
  deleteOperator,
  listWebhookLogs,
  fixWebhookUrls,
} from "@/lib/operators.functions";
import { copyToClipboard } from "@/lib/clipboard";

type TestResult = {
  ok: boolean;
  status: number;
  elapsed_ms: number;
  url: string;
  sent_json: string;
  received_text: string;
  error: string;
};
import { deriveOperatorState, operatorStateMeta } from "@/lib/sac/operator-status";
import { formatDateTime } from "@/lib/sac/format";

export const Route = createFileRoute("/_authenticated/integracao")({
  head: () => ({
    meta: [
      { title: "Integração Evolution API — SAC" },
      { name: "description", content: "Cadastre operadores e receba mensagens da Evolution API em paralelo ao n8n." },
    ],
  }),
  component: IntegracaoPage,
});

type Operator = Awaited<ReturnType<typeof listOperators>>[number];

async function runWebhookTest(op: Operator): Promise<TestResult> {
  const url = `/api/public/webhook/recv/${op.token}`;
  const samplePayload = {
    event: "messages.upsert",
    instance: op.instance_name,
    data: {
      key: {
        // fromMe:true = mensagem do operador, não cria conversa de lead falso
        remoteJid: "5500000000000@s.whatsapp.net",
        fromMe: true,
        id: `TEST_${Date.now()}`,
      },
      pushName: "[TESTE SAC]",
      message: { conversation: "[TESTE] Verificação de conectividade do webhook SAC" },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
  const sent_json = JSON.stringify(samplePayload);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: sent_json,
    });
    const received_text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      elapsed_ms: Date.now() - t0,
      url,
      sent_json,
      received_text,
      error: "",
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      elapsed_ms: Date.now() - t0,
      url,
      sent_json,
      received_text: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function IntegracaoPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOperators);
  const logsFn = useServerFn(listWebhookLogs);
  const fixFn = useServerFn(fixWebhookUrls);

  const operators = useQuery({ queryKey: ["operators"], queryFn: () => listFn() });
  const logs = useQuery({ queryKey: ["webhook-logs"], queryFn: () => logsFn({ data: {} }) });

  useEffect(() => {
    fixFn()
      .then((res) => {
        if (res?.updated && res.updated > 0) {
          qc.invalidateQueries({ queryKey: ["operators"] });
        }
      })
      .catch(() => {});
  }, [fixFn, qc]);

  const [tab, setTab] = useState("list");
  const [selectedPayload, setSelectedPayload] = useState<unknown>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["operators"] });
    qc.invalidateQueries({ queryKey: ["webhook-logs"] });
  }

  return (
    <>
      <AppHeader
        title="Integração Evolution API"
        subtitle="Recebimento direto, em paralelo ao n8n — sem alterar o fluxo existente"
      />
      <main className="flex-1 p-4 md:p-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">Operadores</TabsTrigger>
            <TabsTrigger value="new">Cadastrar operador</TabsTrigger>
            <TabsTrigger value="logs">Logs de recebimento</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-3">
            <OperatorsList
              operators={operators.data ?? []}
              loading={operators.isLoading}
              onChange={refresh}
            />
          </TabsContent>

          <TabsContent value="new">
            <NewOperatorForm
              onCreated={() => {
                refresh();
                setTab("list");
              }}
            />
          </TabsContent>

          <TabsContent value="logs">
            <LogsTable logs={logs.data ?? []} loading={logs.isLoading} onView={setSelectedPayload} />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!selectedPayload} onOpenChange={(o) => !o && setSelectedPayload(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Payload bruto</DialogTitle></DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded bg-surface p-3 text-[11px]">
            {JSON.stringify(selectedPayload, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OperatorsList({
  operators,
  loading,
  onChange,
}: {
  operators: Operator[];
  loading: boolean;
  onChange: () => void;
}) {
  const updateFn = useServerFn(updateOperator);
  const regenFn = useServerFn(regenerateToken);
  const deleteFn = useServerFn(deleteOperator);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [toDelete, setToDelete] = useState<Operator | null>(null);
  const [toEdit, setToEdit] = useState<Operator | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteFn({ data: { id: toDelete.id } });
      toast.success("Operador excluído");
      onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[deleteOperator]", err);
      toast.error(`Erro ao excluir: ${msg}`);
    } finally {
      setToDelete(null);
    }
  }

  if (loading) return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (operators.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <Webhook className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Nenhum operador cadastrado.</p>
        <p className="mt-1 text-xs text-muted-foreground">Clique em "+ Novo operador" para começar.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operador</TableHead>
              <TableHead>Instância</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Última msg</TableHead>
              <TableHead>Hoje</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operators.map((op) => {
              const state = deriveOperatorState({ status: op.status, last_received_at: op.last_received_at });
              const meta = operatorStateMeta[state];
              return (
                <TableRow key={op.id}>
                  <TableCell>
                    <div className="font-medium">{op.name}</div>
                    {op.description && <div className="text-xs text-muted-foreground">{op.description}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{op.instance_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      <span className={`text-xs ${meta.color}`}>{meta.label}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {op.last_received_at ? formatDateTime(op.last_received_at) : "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{op.messages_today}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Copiar URL"
                        onClick={async () => {
                          const ok = await copyToClipboard(op.webhook_url ?? "");
                          if (ok) toast.success("URL do webhook copiada");
                          else toast.error("Não foi possível copiar. Selecione e copie manualmente.");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Testar"
                        onClick={async () => {
                          const res = await runWebhookTest(op);
                          setTestResult(res);
                          onChange();
                        }}
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Regenerar token"
                        onClick={async () => {
                          if (!confirm("Regenerar o token? A URL antiga vai parar de funcionar.")) return;
                          await regenFn({ data: { id: op.id } });
                          toast.success("Novo token gerado");
                          onChange();
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={op.status === "inactive" ? "Ativar" : "Desativar"}
                        onClick={async () => {
                          const next = op.status === "inactive" ? "active" : "inactive";
                          await updateFn({ data: { id: op.id, status: next } });
                          onChange();
                        }}
                      >
                        <span className="text-xs">{op.status === "inactive" ? "On" : "Off"}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Editar"
                        onClick={() => setToEdit(op)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Excluir"
                        className="text-danger hover:bg-danger/10 hover:text-danger"
                        onClick={() => setToDelete(op)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!testResult} onOpenChange={(o) => !o && setTestResult(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {testResult?.ok ? "✅ Webhook funcionando" : "❌ Falha no webhook"}
            </DialogTitle>
          </DialogHeader>
          {testResult && (
            <div className="space-y-3 text-xs">
              <div>Status HTTP: <strong>{testResult.status}</strong> · {testResult.elapsed_ms}ms</div>
              <div className="rounded bg-surface p-2 font-mono break-all">{testResult.url}</div>
              <div>
                <div className="mb-1 font-semibold">Enviado</div>
                <pre className="max-h-40 overflow-auto rounded bg-surface p-2">{testResult.sent_json}</pre>
              </div>
              <div>
                <div className="mb-1 font-semibold">Resposta</div>
                <pre className="max-h-40 overflow-auto rounded bg-surface p-2">{testResult.received_text || "(vazio)"}</pre>
              </div>
              {testResult.error && <div className="text-danger">Erro: {testResult.error}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o operador {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as conversas e mensagens vinculadas serão excluídas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-danger text-white hover:bg-danger/90">
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditOperatorDialog
        operator={toEdit}
        onClose={() => setToEdit(null)}
        onSaved={() => {
          setToEdit(null);
          onChange();
        }}
      />
    </>
  );
}

function EditOperatorDialog({
  operator,
  onClose,
  onSaved,
}: {
  operator: Operator | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateOperator);
  const [name, setName] = useState("");
  const [instance, setInstance] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (operator) {
      setName(operator.name ?? "");
      setInstance(operator.instance_name ?? "");
      setChannel(operator.channel ?? "whatsapp");
      setDescription(operator.description ?? "");
    }
  }, [operator]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!operator) return;
    setSaving(true);
    try {
      await updateFn({
        data: {
          id: operator.id,
          name,
          instance_name: instance,
          channel,
          description: description || null,
        },
      });
      toast.success("Operador atualizado");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!operator} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar operador</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <Label htmlFor="edit-name">Nome *</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="edit-instance">Instância Evolution *</Label>
            <Input id="edit-instance" value={instance} onChange={(e) => setInstance(e.target.value)} required className="mt-1 font-mono" />
            <p className="mt-1 text-xs text-muted-foreground">Deve bater exatamente com o nome da instância na Evolution API.</p>
          </div>
          <div>
            <Label htmlFor="edit-channel">Canal *</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger id="edit-channel" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-desc">Descrição</Label>
            <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand-strong">
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewOperatorForm({ onCreated }: { onCreated: () => void }) {
  const createFn = useServerFn(createOperator);
  const [name, setName] = useState("");
  const [instance, setInstance] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Awaited<ReturnType<typeof createOperator>> | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const op = await createFn({
        data: { name, instance_name: instance, channel, description, status: "pending" },
      });
      setCreated(op);
      setName(""); setInstance(""); setDescription("");
      toast.success("Operador cadastrado");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div>
          <Label htmlFor="name">Nome *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="André" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="instance">Instância Evolution *</Label>
          <Input id="instance" value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="comercial-andre" required className="mt-1 font-mono" />
          <p className="mt-1 text-xs text-muted-foreground">Nome exato da instância na Evolution API.</p>
        </div>
        <div>
          <Label htmlFor="channel">Canal *</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger id="channel" className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="chat">Chat</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="desc">Descrição</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={2} />
        </div>
        <Button type="submit" disabled={submitting} className="bg-brand text-brand-foreground hover:bg-brand-strong">
          {submitting ? "Salvando…" : "Cadastrar e gerar webhook"}
        </Button>
      </form>

      <div className="space-y-4">
        {created && (
          <div className="rounded-lg border border-success/40 bg-success/5 p-4">
            <h3 className="text-sm font-semibold">Operador cadastrado! 🎉</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Cole esta URL no webhook da instância <strong>{created.instance_name}</strong> na Evolution API:
            </p>
            <div className="mt-2 flex gap-2">
              <code className="flex-1 truncate rounded bg-surface px-2 py-2 text-xs font-mono">{created.webhook_url}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const ok = await copyToClipboard(created.webhook_url ?? "");
                  if (ok) toast.success("URL copiada");
                  else toast.error("Não foi possível copiar. Selecione e copie manualmente.");
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
            <p className="mt-2 text-xs">Evento a ativar: <code className="rounded bg-surface px-1">messages.upsert</code></p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4 text-xs leading-relaxed">
          <h3 className="mb-2 text-sm font-semibold">Como adicionar na Evolution API</h3>
          <p className="font-medium">Opção A — Pelo painel:</p>
          <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground">
            <li>Acesse o painel da Evolution API</li>
            <li>Selecione a instância</li>
            <li>Vá em "Webhooks" → "Adicionar webhook"</li>
            <li>Cole a URL gerada acima</li>
            <li>Ative o evento <code>messages.upsert</code> e salve</li>
          </ol>
          <p className="mt-3 font-medium">Opção B — Via curl:</p>
          <pre className="mt-1 overflow-auto rounded bg-surface p-2 text-[10px]">
{`curl -X POST https://<evolution-url>/webhook/set/<instancia> \\
  -H "apikey: <sua-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "<URL gerada pelo SAC>",
    "webhook_by_events": true,
    "events": ["MESSAGES_UPSERT"]
  }'`}
          </pre>
          <p className="mt-2 text-muted-foreground">
            O n8n continua recebendo normalmente — o SAC recebe uma cópia paralela.
          </p>
        </div>
      </div>
    </div>
  );
}

type WebhookLog = Awaited<ReturnType<typeof listWebhookLogs>>[number];

function LogsTable({
  logs,
  loading,
  onView,
}: {
  logs: WebhookLog[];
  loading: boolean;
  onView: (p: unknown) => void;
}) {
  useEffect(() => {}, []);
  if (loading) return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum recebimento ainda. Configure o webhook na Evolution API.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recebido em</TableHead>
            <TableHead>Operador</TableHead>
            <TableHead>HTTP</TableHead>
            <TableHead>Processado</TableHead>
            <TableHead>Mensagem</TableHead>
            <TableHead className="text-right">Payload</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((l) => {
            const op = (l as unknown as { operators?: { name?: string; instance_name?: string } }).operators;
            const okStatus = (l.http_status ?? 0) >= 200 && (l.http_status ?? 0) < 300;
            return (
              <TableRow key={l.id}>
                <TableCell className="text-xs">{formatDateTime(l.received_at)}</TableCell>
                <TableCell className="text-xs">{op?.name ?? "—"}</TableCell>
                <TableCell>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${okStatus ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                    {l.http_status ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{l.processed ? "Sim" : "Não"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.error_message ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => onView(l.payload_raw)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
