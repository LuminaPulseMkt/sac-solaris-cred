import OpenAI from "openai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BUSINESS_HOURS_KEYS,
  DEFAULT_BUSINESS_HOURS,
  describeBusinessHours,
  filterBusinessHours,
  parseBusinessHoursConfig,
  type BusinessHoursConfig,
} from "@/lib/sac/business-hours";

export interface ConversationAnalysis {
  status: "resolved" | "ongoing" | "escalated";
  ended: boolean;
  quality_score: number;
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  highlights: string[];
  improvements: string[];
  conversion_likelihood: "high" | "medium" | "low";
  response_time_assessment: "excellent" | "good" | "slow" | "critical";
  topics: string[];
}

export interface AnalyzeMessage {
  from_role: string;
  message_text: string | null;
  sent_at: string;
  response_time_s: number | null;
  message_type?: string;
  transcription_status?: string | null;
}

async function getSettingValue(key: string): Promise<string> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? "";
}

function formatTranscript(messages: AnalyzeMessage[], operatorName: string, leadName: string): string {
  return messages
    .map((m) => {
      const hh = new Date(m.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const who = m.from_role === "operator" ? operatorName : leadName;
      let text = m.message_text ?? "";
      if (m.message_type === "audio" && m.transcription_status === "done") {
        const clean = text.replace(/^🎤\s*/, "").trim();
        text = `[ÁUDIO TRANSCRITO]: "${clean}"`;
      } else if (m.message_type === "audio" && m.transcription_status === "failed") {
        text = "[áudio não transcrito]";
      } else if (!text || text === "[mídia]") {
        const desc: Record<string, string> = {
          image: "[enviou uma imagem]",
          video: "[enviou um vídeo]",
          document: "[enviou um documento]",
          sticker: "[enviou uma figurinha]",
          location: "[compartilhou localização]",
        };
        text = desc[m.message_type ?? ""] ?? "[mídia]";
      }
      return `[${hh}] ${who}: ${text}`;
    })
    .join("\n");
}

function parseAnalysis(raw: string): ConversationAnalysis {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Resposta sem JSON");
  const json = JSON.parse(raw.slice(start, end + 1)) as Partial<ConversationAnalysis>;
  return {
    status: (json.status as ConversationAnalysis["status"]) ?? "ongoing",
    ended: Boolean(json.ended),
    quality_score: Math.max(0, Math.min(100, Number(json.quality_score ?? 0))),
    sentiment: (json.sentiment as ConversationAnalysis["sentiment"]) ?? "neutral",
    summary: String(json.summary ?? ""),
    highlights: Array.isArray(json.highlights) ? json.highlights.map(String) : [],
    improvements: Array.isArray(json.improvements) ? json.improvements.map(String) : [],
    conversion_likelihood:
      (json.conversion_likelihood as ConversationAnalysis["conversion_likelihood"]) ?? "medium",
    response_time_assessment:
      (json.response_time_assessment as ConversationAnalysis["response_time_assessment"]) ?? "good",
    topics: Array.isArray(json.topics) ? json.topics.map(String) : [],
  };
}

export async function analyzeConversation(params: {
  conversationId: string;
  operatorId: string;
  messages: AnalyzeMessage[];
  operatorName: string;
  leadName: string;
  avgResponseTime: number | null;
  totalMessages: number;
}): Promise<ConversationAnalysis> {
  const apiKey = await getSettingValue("openai_api_key");
  if (!apiKey) {
    throw new Error("OpenAI não configurada. Acesse Configurações > Integrações.");
  }
  const openai = new OpenAI({ apiKey });

  const transcript = formatTranscript(params.messages, params.operatorName, params.leadName);
  const prompt = `Você é um especialista em qualidade de atendimento ao cliente via WhatsApp.

Analise a conversa entre o operador "${params.operatorName}" e o lead "${params.leadName}".

CONVERSA (mensagens de áudio aparecem como [ÁUDIO TRANSCRITO]: "texto"):
${transcript}

MÉTRICAS:
- Tempo médio de resposta do operador: ${params.avgResponseTime ?? "n/d"}s
- Total de mensagens: ${params.totalMessages}

Responda APENAS com JSON válido, sem texto adicional:
{
  "status": "resolved|ongoing|escalated",
  "ended": true|false,
  "quality_score": 0-100,
  "sentiment": "positive|neutral|negative",
  "summary": "resumo em português",
  "highlights": ["ponto 1"],
  "improvements": ["sugestão 1"],
  "conversion_likelihood": "high|medium|low",
  "response_time_assessment": "excellent|good|slow|critical",
  "topics": ["tópico 1"]
}

Critérios:
- ended=true: despedida explícita, agradecimento final, problema confirmado resolvido
- response_time_assessment: excellent≤2min, good≤5min, slow≤10min, critical>10min
- quality_score: considere cordialidade, objetividade, resolução e tempo`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const analysis = parseAnalysis(raw);

  await supabaseAdmin.from("ai_analyses").insert({
    conversation_id: params.conversationId,
    operator_id: params.operatorId,
    status: analysis.status,
    ended: analysis.ended,
    quality_score: analysis.quality_score,
    sentiment: analysis.sentiment,
    summary: analysis.summary,
    highlights: analysis.highlights,
    improvements: analysis.improvements,
    conversion_likelihood: analysis.conversion_likelihood,
    response_time_assessment: analysis.response_time_assessment,
    topics: analysis.topics,
    raw_response: { content: raw } as never,
  });

  if (analysis.ended) {
    await supabaseAdmin
      .from("conversations")
      .update({ status: "resolved", ended_at: new Date().toISOString() })
      .eq("id", params.conversationId);
  }

  await recalcOperatorMetrics(params.operatorId).catch(() => {});

  return analysis;
}

export async function recalcOperatorMetrics(operatorId: string): Promise<void> {
  const { data: analyses } = await supabaseAdmin
    .from("ai_analyses")
    .select("quality_score, sentiment, ended, topics, improvements")
    .eq("operator_id", operatorId);

  if (!analyses?.length) return;

  const total = analyses.length;
  const avgQuality = Number(
    (analyses.reduce((s, a) => s + (a.quality_score ?? 0), 0) / total).toFixed(2),
  );
  const sentPos = analyses.filter((a) => a.sentiment === "positive").length;
  const sentNeu = analyses.filter((a) => a.sentiment === "neutral").length;
  const sentNeg = analyses.filter((a) => a.sentiment === "negative").length;
  const totalEnded = analyses.filter((a) => a.ended).length;

  const topicCount: Record<string, number> = {};
  analyses.forEach((a) => {
    (Array.isArray(a.topics) ? (a.topics as string[]) : []).forEach((t) => {
      topicCount[t] = (topicCount[t] ?? 0) + 1;
    });
  });
  const topTopics = Object.entries(topicCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => ({ topic, count }));

  const impCount: Record<string, number> = {};
  analyses.forEach((a) => {
    (Array.isArray(a.improvements) ? (a.improvements as string[]) : []).forEach((i) => {
      impCount[i] = (impCount[i] ?? 0) + 1;
    });
  });
  const topImprovements = Object.entries(impCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text, count]) => ({ text, count }));

  await supabaseAdmin.from("operator_ai_metrics").upsert(
    {
      operator_id: operatorId,
      total_analyzed: total,
      total_ended: totalEnded,
      total_ongoing: total - totalEnded,
      avg_quality_score: avgQuality,
      sentiment_positive: sentPos,
      sentiment_neutral: sentNeu,
      sentiment_negative: sentNeg,
      top_topics: topTopics as never,
      top_improvements: topImprovements as never,
      last_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "operator_id" },
  );
}


export async function analyzeConversationById(conversationId: string): Promise<ConversationAnalysis> {
  try {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("*, operators(name)")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada: " + conversationId);

    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("from_role, message_text, sent_at, response_time_s, message_type, transcription_status" as never)
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true });

    const operatorName =
      (conv as unknown as { operators?: { name?: string } }).operators?.name ?? "Operador";

    return await analyzeConversation({
      conversationId,
      operatorId: conv.operator_id,
      messages: ((msgs ?? []) as unknown) as AnalyzeMessage[],
      operatorName,
      leadName: conv.lead_name ?? conv.lead_phone ?? "Lead",
      avgResponseTime: conv.avg_response_time_s,
      totalMessages: conv.total_messages,
    });
  } catch (e) {
    console.error("[analyzeConversationById] erro em", conversationId, e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}
