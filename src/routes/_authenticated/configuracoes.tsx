import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/stores/settings";
import type { Channel } from "@/types/sac";
import { Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getSettings,
  saveSetting,
  testEvolutionConnection,
  getActiveInstances,
} from "@/lib/settings/settings.functions";
import { testWhisperTranscription, transcribePendingAudios } from "@/lib/ai/ai.functions";
import { cn } from "@/lib/utils";
import {
  BUSINESS_HOURS_KEYS,
  DEFAULT_BUSINESS_HOURS,
  WEEKDAY_LABELS,
  describeBusinessHours,
  minutesToTime,
  parseBusinessHoursConfig,
  parseTimeToMinutes,
  type BusinessHoursConfig,
} from "@/lib/sac/business-hours";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — SAC" },
      { name: "description", content: "Metas de SLA, integrações OpenAI/Evolution e relatórios." },
    ],
  }),
  component: ConfiguracoesPage,
});

type WhatsappNumber = { number: string; label?: string };

function ConfiguracoesPage() {
  return (
    <>
      <AppHeader title="Configurações" subtitle="Metas, integrações e relatórios" />
      <main className="flex-1 space-y-6 p-4 md:p-6">
        <Tabs defaultValue="geral">
          <TabsList>
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="integracoes">Integrações</TabsTrigger>
            <TabsTrigger value="relatorios">Relatórios & WhatsApp</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="mt-4">
            <GeralTab />
          </TabsContent>
          <TabsContent value="integracoes" className="mt-4">
            <IntegracoesTab />
          </TabsContent>
          <TabsContent value="relatorios" className="mt-4">
            <RelatoriosTab />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

function BusinessHoursCard() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getSettings);
  const save = useServerFn(saveSetting);
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings() });

  const [cfg, setCfg] = useState<BusinessHoursConfig>(DEFAULT_BUSINESS_HOURS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) setCfg(parseBusinessHoursConfig(settings.data.values));
  }, [settings.data]);

  function toggleDay(day: number) {
    setCfg((c) => ({
      ...c,
      days: c.days.includes(day) ? c.days.filter((d) => d !== day) : [...c.days, day].sort((a, b) => a - b),
    }));
  }

  async function handleSave() {
    if (!cfg.days.length) {
      toast.error("Selecione ao menos um dia da semana");
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        save({ data: { key: BUSINESS_HOURS_KEYS.enabled, value: String(cfg.enabled) } }),
        save({ data: { key: BUSINESS_HOURS_KEYS.start, value: minutesToTime(cfg.startMinutes) } }),
        save({ data: { key: BUSINESS_HOURS_KEYS.end, value: minutesToTime(cfg.endMinutes) } }),
        save({ data: { key: BUSINESS_HOURS_KEYS.days, value: cfg.days.join(",") } }),
        save({ data: { key: BUSINESS_HOURS_KEYS.timezone, value: cfg.timezone } }),
      ]);
      toast.success("Horário comercial salvo");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar horário comercial");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Horário comercial das análises</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            As análises de IA consideram apenas mensagens em dias úteis dentro desta janela.
          </p>
        </div>
        <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg((c) => ({ ...c, enabled: v }))} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="bh-start">Início</Label>
          <Input
            id="bh-start"
            type="time"
            disabled={!cfg.enabled}
            value={minutesToTime(cfg.startMinutes)}
            onChange={(e) =>
              setCfg((c) => ({ ...c, startMinutes: parseTimeToMinutes(e.target.value) ?? c.startMinutes }))
            }
            className="mt-1 h-9"
          />
        </div>
        <div>
          <Label htmlFor="bh-end">Fim</Label>
          <Input
            id="bh-end"
            type="time"
            disabled={!cfg.enabled}
            value={minutesToTime(cfg.endMinutes)}
            onChange={(e) =>
              setCfg((c) => ({ ...c, endMinutes: parseTimeToMinutes(e.target.value) ?? c.endMinutes }))
            }
            className="mt-1 h-9"
          />
        </div>
      </div>

      <div className="mt-4">
        <Label>Dias considerados</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, day) => {
            const active = cfg.days.includes(day);
            return (
              <button
                key={label}
                type="button"
                disabled={!cfg.enabled}
                onClick={() => toggleDay(day)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{describeBusinessHours(cfg)}</p>

      <Button onClick={handleSave} disabled={saving} className="mt-4 h-9">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar horário comercial"}
      </Button>
    </div>
  );
}

function GeralTab() {
  const { sla, setSla, minScore, setMinScore, theme, setTheme } = useSettingsStore();

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-2">
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
          <div>
            <Label htmlFor="ms">Score mínimo aceitável</Label>
            <Input id="ms" type="number" min={0} max={100}
              value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="mt-1 h-9" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Pesos: tempo 40% · resolução 35% · conversão 25%</p>
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
    </div>
  );
}

function SecretField({
  label,
  storageKey,
  configured,
  lastFour,
  hint,
  onSaved,
}: {
  label: string;
  storageKey: string;
  configured: boolean;
  lastFour: string | null;
  hint?: string;
  onSaved: () => void;
}) {
  const [val, setVal] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = useServerFn(saveSetting);

  const handleSave = async () => {
    if (!val) return toast.error("Informe um valor");
    setSaving(true);
    try {
      await save({ data: { key: storageKey, value: val } });
      toast.success(`${label} salvo`);
      setVal("");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type={show ? "text" : "password"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={configured ? `••••••••${lastFour ?? ""}` : "Cole sua chave aqui"}
          className="h-9 flex-1"
        />
        <Button type="button" size="icon" variant="outline" onClick={() => setShow((s) => !s)}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
        </Button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {configured ? (
          <Badge variant="secondary" className="bg-success/15 text-success">● Configurada</Badge>
        ) : (
          <Badge variant="outline">○ Não configurada</Badge>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

function PlainField({
  label,
  storageKey,
  initialValue,
  placeholder,
  onSaved,
}: {
  label: string;
  storageKey: string;
  initialValue: string;
  placeholder?: string;
  onSaved: () => void;
}) {
  const [val, setVal] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const save = useServerFn(saveSetting);
  useEffect(() => setVal(initialValue), [initialValue]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ data: { key: storageKey, value: val } });
      toast.success(`${label} salvo`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} className="h-9 flex-1" />
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function IntegracoesTab() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getSettings);
  const testEvo = useServerFn(testEvolutionConnection);

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings() });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    status: number;
    statusText: string;
    error?: string | null;
    instances: string[];
    url: string;
  } | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["settings"] });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testEvo();
      setTestResult(r);
      if (r.success) toast.success(`HTTP ${r.status} — ${r.instances.length} instâncias`);
      else toast.error(`HTTP ${r.status || "—"}: ${r.error || "Falha ao conectar"}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha";
      setTestResult({ success: false, status: 0, statusText: "", error: msg, instances: [], url: "" });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  if (settings.isLoading || !settings.data) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  const { values, sensitive } = settings.data;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold">🤖 OpenAI</h2>
        <SecretField
          label="OpenAI API Key"
          storageKey="openai_api_key"
          configured={sensitive.openai_api_key?.configured ?? false}
          lastFour={sensitive.openai_api_key?.lastFour ?? null}
          hint="Obtenha em platform.openai.com/api-keys"
          onSaved={invalidate}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold">⚡ Evolution API</h2>
        <PlainField
          label="URL da Evolution API"
          storageKey="evolution_api_url"
          initialValue={values.evolution_api_url ?? ""}
          placeholder="https://evolution.seudominio.com"
          onSaved={invalidate}
        />
        <SecretField
          label="API Key da Evolution"
          storageKey="evolution_api_key"
          configured={sensitive.evolution_api_key?.configured ?? false}
          lastFour={sensitive.evolution_api_key?.lastFour ?? null}
          onSaved={invalidate}
        />
        <div className="space-y-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Testar conexão"}
          </Button>
          {testResult && (
            <div
              className={`rounded-md border p-3 text-xs ${
                testResult.success
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="font-mono font-semibold">
                {testResult.success ? "✅" : "❌"} HTTP {testResult.status || "—"} {testResult.statusText}
              </div>
              {testResult.url && <div className="mt-1 break-all opacity-80">GET {testResult.url}</div>}
              {testResult.success ? (
                <div className="mt-1">{testResult.instances.length} instância(s): {testResult.instances.join(", ") || "—"}</div>
              ) : (
                <div className="mt-1 break-words">{testResult.error}</div>
              )}
            </div>
          )}
        </div>
      </section>

      <WhisperTestSection />

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">🧠 Análise automática</h2>
        <AutoAnalyzeToggle initial={values.ai_auto_analyze === "true"} onSaved={invalidate} />
      </section>
    </div>
  );
}

function WhisperTestSection() {
  const transcribe = useServerFn(testWhisperTranscription);
  const transcribePending = useServerFn(transcribePendingAudios);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    text: string | null;
    elapsedMs: number;
    error: string | null;
  } | null>(null);

  const handlePending = async () => {
    setPendingBusy(true);
    try {
      const r = await transcribePending({ data: { limit: 20 } });
      toast.success(`Áudios pendentes: ${r.transcribed} transcrito(s), ${r.failed} falha(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao transcrever pendentes");
    } finally {
      setPendingBusy(false);
    }
  };

  const handleRun = async () => {
    if (!file) return toast.error("Selecione um arquivo de áudio");
    if (file.size > 24 * 1024 * 1024) return toast.error("Áudio acima de 24MB");
    setBusy(true);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const base64 = btoa(bin);
      const r = await transcribe({
        data: { base64, mimeType: file.type || "audio/ogg" },
      });
      setResult(r);
      if (r.ok) toast.success(`Whisper OK em ${r.elapsedMs}ms`);
      else toast.error(r.error || "Falha na transcrição");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha";
      setResult({ ok: false, text: null, elapsedMs: 0, error: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">🎤 Testar transcrição (Whisper)</h2>
      <p className="text-xs text-muted-foreground">
        Envia um áudio direto ao Whisper (mesmo módulo usado pelo webhook) e confirma se a chave
        OpenAI e o pipeline de transcrição estão funcionando.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="h-9 max-w-md"
        />
        <Button size="sm" onClick={handleRun} disabled={busy || !file}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Testar"}
        </Button>
        <Button size="sm" variant="outline" onClick={handlePending} disabled={pendingBusy}>
          {pendingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Transcrever pendentes"}
        </Button>
      </div>
      {result && (
        <div
          className={`rounded-md border p-3 text-xs ${
            result.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="font-mono font-semibold">
            {result.ok ? "✅" : "❌"} Whisper · {result.elapsedMs}ms
          </div>
          {result.ok ? (
            <div className="mt-1 whitespace-pre-wrap break-words text-foreground">
              🎤 {result.text}
            </div>
          ) : (
            <div className="mt-1 break-words">{result.error}</div>
          )}
        </div>
      )}
    </section>
  );
}

function AutoAnalyzeToggle({ initial, onSaved }: { initial: boolean; onSaved: () => void }) {
  const [val, setVal] = useState(initial);
  const save = useServerFn(saveSetting);
  useEffect(() => setVal(initial), [initial]);
  return (
    <div className="flex items-center justify-between rounded-md bg-surface p-2">
      <Label className="font-normal">Analisar conversas automaticamente com IA</Label>
      <Switch
        checked={val}
        onCheckedChange={async (v) => {
          setVal(v);
          await save({ data: { key: "ai_auto_analyze", value: v ? "true" : "false" } });
          toast.success("Salvo");
          onSaved();
        }}
      />
    </div>
  );
}

function RelatoriosTab() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getSettings);
  const fetchInstances = useServerFn(getActiveInstances);
  const save = useServerFn(saveSetting);

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings() });
  const instances = useQuery({ queryKey: ["active-instances"], queryFn: () => fetchInstances() });

  const [newNumber, setNewNumber] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["settings"] });

  if (settings.isLoading || !settings.data) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }
  const v = settings.data.values;
  const numbers: WhatsappNumber[] = (() => {
    try { return JSON.parse(v.report_whatsapp_numbers || "[]"); } catch { return []; }
  })();

  const persistNumbers = async (next: WhatsappNumber[]) => {
    await save({ data: { key: "report_whatsapp_numbers", value: JSON.stringify(next) } });
    invalidate();
  };

  const addNumber = async () => {
    const digits = newNumber.replace(/\D/g, "");
    if (digits.length < 12) return toast.error("Número inválido (mínimo 12 dígitos com DDI)");
    if (numbers.find((n) => n.number === digits)) return toast.error("Número já cadastrado");
    await persistNumbers([...numbers, { number: digits, label: newLabel || undefined }]);
    setNewNumber("");
    setNewLabel("");
    toast.success("Número adicionado");
  };

  const removeNumber = async (n: string) => {
    await persistNumbers(numbers.filter((x) => x.number !== n));
    toast.success("Removido");
  };

  const setSchedule = async (key: string, value: string) => {
    await save({ data: { key, value } });
    invalidate();
    toast.success("Salvo");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold">📱 Números para envio de relatório</h2>

        <div>
          <Label>Instância para envio</Label>
          <Select
            value={v.report_evolution_instance || ""}
            onValueChange={(val) => setSchedule("report_evolution_instance", val)}
          >
            <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecionar instância" /></SelectTrigger>
            <SelectContent>
              {(instances.data ?? []).map((i) => (
                <SelectItem key={i.id} value={i.instance_name}>
                  {i.instance_name} ({i.channel})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Usa as instâncias ativas cadastradas em Operadores.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="55 + DDD + número (ex: 5511999990001)"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
          />
          <Input placeholder="Apelido (opcional)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Button onClick={addNumber}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>

        <div className="space-y-1">
          {numbers.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum número cadastrado.</p>
          )}
          {numbers.map((n) => (
            <div key={n.number} className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm">
              <span>📱 +{n.number}{n.label ? ` — ${n.label}` : ""}</span>
              <Button variant="ghost" size="sm" onClick={() => removeNumber(n.number)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">📅 Envio automático</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Frequência</Label>
            <Select value={v.report_schedule || "manual"} onValueChange={(val) => setSchedule("report_schedule", val)}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Horário</Label>
            <Input
              type="time"
              defaultValue={v.report_schedule_time || "08:00"}
              onBlur={(e) => setSchedule("report_schedule_time", e.target.value)}
              className="mt-1 h-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <ToggleSetting
            label="Incluir análise de IA no PDF"
            storageKey="report_include_ai"
            initial={v.report_include_ai === "true"}
            onSaved={invalidate}
          />
          <ToggleSetting
            label="Incluir tabela completa de conversas"
            storageKey="report_include_table"
            initial={v.report_include_table === "true"}
            onSaved={invalidate}
          />
        </div>
      </section>
    </div>
  );
}

function ToggleSetting({
  label,
  storageKey,
  initial,
  onSaved,
}: {
  label: string;
  storageKey: string;
  initial: boolean;
  onSaved: () => void;
}) {
  const [val, setVal] = useState(initial);
  const save = useServerFn(saveSetting);
  useEffect(() => setVal(initial), [initial]);
  return (
    <div className="flex items-center justify-between rounded-md bg-surface p-2">
      <Label className="font-normal">{label}</Label>
      <Switch
        checked={val}
        onCheckedChange={async (v) => {
          setVal(v);
          await save({ data: { key: storageKey, value: v ? "true" : "false" } });
          toast.success("Salvo");
          onSaved();
        }}
      />
    </div>
  );
}
