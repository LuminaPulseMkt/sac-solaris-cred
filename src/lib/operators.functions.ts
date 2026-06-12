import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHost } from "@tanstack/react-start/server";

function buildWebhookUrl(token: string): string {
  const envBase = process.env.PUBLIC_APP_URL;
  let base = envBase;
  if (!base) {
    try {
      const host = getRequestHost();
      const proto = host?.includes("localhost") ? "http" : "https";
      base = host ? `${proto}://${host}` : "";
    } catch {
      base = "";
    }
  }
  return `${base}/api/public/webhook/recv/${token}`;
}

export const listOperators = createServerFn({ method: "GET" }).handler(async () => {
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

export const createOperator = createServerFn({ method: "POST" })
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

export const updateOperator = createServerFn({ method: "POST" })
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

export const regenerateToken = createServerFn({ method: "POST" })
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

export const deleteOperator = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("operators").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWebhookLogs = createServerFn({ method: "GET" })
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
