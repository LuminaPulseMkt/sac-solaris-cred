import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getRequestHost } from "@tanstack/react-start/server";

function getPublicAppUrl(): string {
  const envBase =
    process.env.VITE_PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_URL ||
    "";
  if (envBase) return envBase.replace(/\/+$/, "");
  try {
    const host = getRequestHost();
    if (host && !host.includes("localhost")) {
      return `https://${host}`;
    }
  } catch {
    // ignore
  }
  return "";
}

function buildWebhookUrl(token: string): string {
  const base = getPublicAppUrl();
  return `${base}/api/public/webhook/recv/${token}`;
}

export const fixWebhookUrls = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const base = getPublicAppUrl();
  if (!base) return { updated: 0 };
  const { data: ops, error } = await supabaseAdmin
    .from("operators")
    .select("id, token, webhook_url");
  if (error) throw new Error(error.message);
  let updated = 0;
  for (const op of ops ?? []) {
    const expected = `${base}/api/public/webhook/recv/${op.token}`;
    const current = op.webhook_url ?? "";
    const needsFix =
      !current ||
      current.includes("localhost") ||
      current.includes("127.0.0.1") ||
      current.startsWith("/") ||
      current !== expected;
    if (needsFix) {
      await supabaseAdmin.from("operators").update({ webhook_url: expected }).eq("id", op.id);
      updated++;
    }
  }
  return { updated };
});

export const listOperators = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("operators")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const createSchema = z.object({
  name: z.string().min(1),
  instance_name: z.string().min(1),
  channel: z.string().default("whatsapp"),
  description: z.string().optional().nullable(),
  status: z.enum(["pending", "active", "inactive"]).default("pending"),
});

export const createOperator = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("operators")
      .insert({
        name: data.name,
        instance_name: data.instance_name,
        channel: data.channel,
        description: data.description ?? null,
        status: data.status,
      })
      .select()
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao criar operador");
    const webhook_url = buildWebhookUrl(created.token);
    await supabaseAdmin.from("operators").update({ webhook_url }).eq("id", created.id);
    return { ...created, webhook_url };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  instance_name: z.string().optional(),
  channel: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["pending", "active", "inactive", "error"]).optional(),
});

export const updateOperator = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    const { data: updated, error } = await supabaseAdmin
      .from("operators")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const regenerateToken = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const newToken = crypto.randomUUID().replace(/-/g, "");
    const webhook_url = buildWebhookUrl(newToken);
    const { data: updated, error } = await supabaseAdmin
      .from("operators")
      .update({ token: newToken, webhook_url })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteOperator = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Limpa dependências (CASCADE já cobre a maioria, mas garantimos aqui).
    await supabaseAdmin.from("webhook_logs").delete().eq("operator_id", data.id);
    await supabaseAdmin.from("messages").delete().eq("operator_id", data.id);
    await supabaseAdmin.from("conversations").delete().eq("operator_id", data.id);
    const { error } = await supabaseAdmin.from("operators").delete().eq("id", data.id);
    if (error) {
      console.error("[deleteOperator] falha", error);
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const listWebhookLogs = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ operator_id: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("webhook_logs")
      .select("*, operators(name, instance_name)")
      .order("received_at", { ascending: false })
      .limit(100);
    if (data.operator_id) query = query.eq("operator_id", data.operator_id);
    const { data: logs, error } = await query;
    if (error) throw new Error(error.message);
    return logs ?? [];
  });

export const deleteConversation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("messages").delete().eq("conversation_id", data.id);
    const { error } = await supabaseAdmin.from("conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConversations = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("messages").delete().in("conversation_id", data.ids);
    const { error } = await supabaseAdmin.from("conversations").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

const conversationIdSchema = z.object({ id: z.string().uuid() });

export const getConversationDetail = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => conversationIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conversation, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return conversation ?? null;
  });

export const listConversationMessages = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => conversationIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: messages, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", data.id)
      .order("sent_at", { ascending: true });
    if (error) throw new Error(error.message);
    return messages ?? [];
  });

export const listConversations = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("*, operators(name, instance_name)")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listOperatorStats = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ops, error } = await supabaseAdmin.from("operators").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { data: convs } = await supabaseAdmin
    .from("conversations")
    .select("operator_id, score_sac, avg_response_time_s, converted, status, updated_at, started_at");
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const stats = (ops ?? []).map((op) => {
    const cs = (convs ?? []).filter((c) => c.operator_id === op.id);
    const total = cs.length;
    const todayActive = cs.filter((c) => c.updated_at && new Date(c.updated_at) >= todayStart).length;
    const todayNew = cs.filter((c) => c.started_at && new Date(c.started_at) >= todayStart).length;
    const avgScore = total ? Math.round(cs.reduce((a, x) => a + (x.score_sac ?? 0), 0) / total) : 0;
    const avgResp = total ? cs.reduce((a, x) => a + (x.avg_response_time_s ?? 0), 0) / total : 0;
    const convRate = total ? (cs.filter((x) => x.converted).length / total) * 100 : 0;
    return { ...op, total, todayActive, todayNew, avgScore, avgResp, convRate };
  });
  return stats;
});

export const listWebhookHealth = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: ops, error } = await supabaseAdmin
    .from("operators")
    .select("id, name, instance_name, channel, status, token, webhook_url, last_received_at")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  const { data: logs } = await supabaseAdmin
    .from("webhook_logs")
    .select("operator_id, http_status, received_at")
    .gte("received_at", since);
  return (ops ?? []).map((op) => {
    const ls = (logs ?? []).filter((l) => l.operator_id === op.id);
    const total24h = ls.length;
    const errors24h = ls.filter((l) => (l.http_status ?? 0) >= 400).length;
    return { ...op, total24h, errors24h };
  });
});
