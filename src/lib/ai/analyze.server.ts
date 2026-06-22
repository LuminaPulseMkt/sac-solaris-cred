import OpenAI from "openai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
      return `[${hh}] ${who}: ${m.message_text ?? "[mídia]"}`;
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

CONVERSA:
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

  return analysis;
}

export async function analyzeConversationById(conversationId: string): Promise<ConversationAnalysis> {
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("*, operators(name)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) throw new Error("Conversa não encontrada");

  const { data: msgs } = await supabaseAdmin
    .from("messages")
    .select("from_role, message_text, sent_at, response_time_s")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });

  const operatorName =
    (conv as unknown as { operators?: { name?: string } }).operators?.name ?? "Operador";

  return analyzeConversation({
    conversationId,
    operatorId: conv.operator_id,
    messages: (msgs ?? []) as AnalyzeMessage[],
    operatorName,
    leadName: conv.lead_name ?? conv.lead_phone ?? "Lead",
    avgResponseTime: conv.avg_response_time_s,
    totalMessages: conv.total_messages,
  });
}
