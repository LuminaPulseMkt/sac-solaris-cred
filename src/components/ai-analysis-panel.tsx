import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  analyzeConversationFn,
  getConversationAnalysis,
  isOpenAiConfigured,
} from "@/lib/ai/ai.functions";

interface Props {
  conversationId: string;
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "😊 Positivo",
  neutral: "😐 Neutro",
  negative: "😞 Negativo",
};

const RT_LABEL: Record<string, string> = {
  excellent: "Excelente",
  good: "Bom",
  slow: "Lento",
  critical: "Crítico",
};

const CONV_LABEL: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

export function AiAnalysisPanel({ conversationId }: Props) {
  const qc = useQueryClient();
  const fetchAnalysis = useServerFn(getConversationAnalysis);
  const fetchConfig = useServerFn(isOpenAiConfigured);
  const runAnalyze = useServerFn(analyzeConversationFn);
  const [analyzing, setAnalyzing] = useState(false);

  const cfg = useQuery({ queryKey: ["ai-cfg"], queryFn: () => fetchConfig() });
  const analysis = useQuery({
    queryKey: ["ai-analysis", conversationId],
    queryFn: () => fetchAnalysis({ data: { conversationId } }),
    refetchInterval: 15_000,
  });

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await runAnalyze({ data: { conversationId } });
      toast.success("Análise concluída");
      qc.invalidateQueries({ queryKey: ["ai-analysis", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao analisar");
    } finally {
      setAnalyzing(false);
    }
  };

  if (cfg.data && !cfg.data.configured) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-warning" />
          <div className="flex-1">
            <h3 className="font-semibold">Análise de IA não configurada</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure a chave da OpenAI para habilitar análise automática das conversas.
            </p>
            <Link to="/configuracoes" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
              Ir para Configurações → Integrações
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const a = analysis.data;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Análise da IA</h3>
        </div>
        <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analisar agora"}
        </Button>
      </div>

      {analysis.isLoading ? (
        <div className="h-24 animate-pulse rounded bg-muted" />
      ) : !a ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma análise ainda. Clique em "Analisar agora" para gerar.
        </p>
      ) : (
        <>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">📝 Resumo</div>
            <p className="text-sm">{a.summary}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Score IA" value={`${a.quality_score}/100`} />
            <Stat label="Sentimento" value={SENTIMENT_LABEL[a.sentiment ?? "neutral"] ?? "—"} />
            <Stat label="Conversão" value={CONV_LABEL[a.conversion_likelihood ?? "medium"] ?? "—"} />
            <Stat label="Tempo" value={RT_LABEL[a.response_time_assessment ?? "good"] ?? "—"} />
          </div>

          {Array.isArray(a.highlights) && a.highlights.length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">✅ Pontos positivos</div>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {(a.highlights as string[]).map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </div>
          )}

          {Array.isArray(a.improvements) && a.improvements.length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">💡 Sugestões de melhoria</div>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {(a.improvements as string[]).map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </div>
          )}

          {Array.isArray(a.topics) && a.topics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(a.topics as string[]).map((t, i) => <Badge key={i} variant="secondary">{t}</Badge>)}
            </div>
          )}

          {a.ended && (
            <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              ✅ IA identificou que a conversa foi encerrada
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-surface px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}
