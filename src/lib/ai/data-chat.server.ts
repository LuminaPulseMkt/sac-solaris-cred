import OpenAI from "openai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DataChatMessage = { role: "user" | "assistant"; content: string };

async function getSettingValue(key: string): Promise<string> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? "";
}

/**
 * Monta um snapshot agregado dos dados de SAC para servir de contexto ao LLM.
 * Nunca enviamos telefones completos nem payloads brutos — apenas agregados.
 */
export async function buildDataSnapshot(operatorId: string | null): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceIso = since.toISOString();

  let opsQuery = supabaseAdmin
    .from("operators")
    .select("id, name, instance_name, channel, status")
    .limit(100);
  if (operatorId) opsQuery = opsQuery.eq("id", operatorId);
  const { data: operators } = await opsQuery;

  let convQuery = supabaseAdmin
    .from("conversations")
    .select("id, operator_id, status, converted, score_sac, avg_response_time_s, total_messages, started_at, lead_name")
    .gte("started_at", sinceIso)
    .order("started_at", { ascending: false })
    .limit(500);
  if (operatorId) convQuery = convQuery.eq("operator_id", operatorId);
  const { data: conversations } = await convQuery;

  let anQuery = supabaseAdmin
    .from("ai_analyses")
    .select("operator_id, sentiment, quality_score, summary, topics, improvements, analyzed_at, ended")
    .gte("analyzed_at", sinceIso)
    .order("analyzed_at", { ascending: false })
    .limit(200);
  if (operatorId) anQuery = anQuery.eq("operator_id", operatorId);
  const { data: analyses } = await anQuery;

  const convs = conversations ?? [];
  const opName = new Map((operators ?? []).map((o) => [o.id, o.name as string]));

  const total = convs.length;
  const converted = convs.filter((c) => c.converted).length;
  const resolved = convs.filter((c) => c.status === "resolved").length;
  const scores = convs.map((c) => c.score_sac).filter((s): s is number => typeof s === "number");
  const rts = convs.map((c) => c.avg_response_time_s).filter((s): s is number => typeof s === "number");
  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

  const perOperator = (operators ?? []).map((o) => {
    const mine = convs.filter((c) => c.operator_id === o.id);
    const myScores = mine.map((c) => c.score_sac).filter((s): s is number => typeof s === "number");
    const myRts = mine.map((c) => c.avg_response_time_s).filter((s): s is number => typeof s === "number");
    return {
      operador: o.name,
      instancia: o.instance_name,
      status: o.status,
      conversas_7d: mine.length,
      score_medio: avg(myScores),
      tempo_medio_resposta_s: avg(myRts),
      convertidas: mine.filter((c) => c.converted).length,
    };
  });

  const topicCount: Record<string, number> = {};
  const impCount: Record<string, number> = {};
  const sentiments = { positive: 0, neutral: 0, negative: 0 } as Record<string, number>;
  for (const a of analyses ?? []) {
    if (a.sentiment && a.sentiment in sentiments) sentiments[a.sentiment]++;
    for (const t of Array.isArray(a.topics) ? (a.topics as string[]) : []) topicCount[t] = (topicCount[t] ?? 0) + 1;
    for (const i of Array.isArray(a.improvements) ? (a.improvements as string[]) : [])
      impCount[i] = (impCount[i] ?? 0) + 1;
  }
  const top = (rec: Record<string, number>, n: number) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => ({ item: k, ocorrencias: v }));

  const recentConversations = convs.slice(0, 40).map((c) => ({
    lead: c.lead_name ?? "sem nome",
    operador: opName.get(c.operator_id) ?? "—",
    status: c.status,
    convertida: c.converted,
    score: c.score_sac,
    mensagens: c.total_messages,
    inicio: c.started_at,
  }));

  const recentSummaries = (analyses ?? []).slice(0, 15).map((a) => ({
    operador: opName.get(a.operator_id ?? "") ?? "—",
    sentimento: a.sentiment,
    qualidade: a.quality_score,
    resumo: typeof a.summary === "string" ? a.summary.slice(0, 400) : null,
  }));

  const snapshot = {
    janela: "últimos 7 dias",
    escopo: operatorId ? "apenas o operador logado" : "todos os operadores",
    totais: {
      conversas: total,
      resolvidas: resolved,
      convertidas: converted,
      taxa_conversao_pct: total ? Math.round((converted / total) * 100) : 0,
      score_medio: avg(scores),
      tempo_medio_resposta_s: avg(rts),
    },
    sentimentos_ia: sentiments,
    por_operador: perOperator,
    top_topicos: top(topicCount, 10),
    top_melhorias: top(impCount, 8),
    conversas_recentes: recentConversations,
    resumos_ia_recentes: recentSummaries,
  };

  return JSON.stringify(snapshot, null, 1);
}

export async function askDataChatServer(
  messages: DataChatMessage[],
  operatorId: string | null,
): Promise<{ answer: string }> {
  const apiKey = await getSettingValue("openai_api_key");
  if (!apiKey.trim()) {
    throw new Error("OpenAI não configurada. Acesse Configurações → Integrações.");
  }

  const snapshot = await buildDataSnapshot(operatorId);
  const openai = new OpenAI({ apiKey });

  const system = [
    "Você é a Solaris Analytics, analista de atendimento (SAC) via WhatsApp.",
    "Responda SEMPRE em português do Brasil, de forma objetiva e acionável.",
    "Use exclusivamente os dados do SNAPSHOT abaixo. Se a informação não estiver nele, diga que não há dados suficientes.",
    "Nunca invente números. Cite valores e nomes exatamente como aparecem.",
    "Formate com markdown simples (listas curtas, negrito em métricas). Máximo ~250 palavras salvo pedido explícito.",
    "",
    "SNAPSHOT DE DADOS (JSON):",
    snapshot,
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      { role: "system", content: system },
      ...messages.slice(-12).map((m) => ({ role: m.role, content: m.content }) as const),
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim();
  if (!answer) throw new Error("A IA não retornou resposta. Tente novamente.");
  return { answer };
}
