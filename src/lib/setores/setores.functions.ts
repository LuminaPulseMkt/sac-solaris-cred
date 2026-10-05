import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/auth/require-permission";
import { requireAdmin } from "@/lib/auth/require-admin";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const listSetores = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: setores, error } = await supabaseAdmin
    .from("setores")
    .select(
      "id, name, created_at, sla_minutes, business_days, business_start_minutes, business_end_minutes, business_timezone, alert_whatsapp_number",
    )
    .order("name");
  if (error) throw new Error(error.message);

  const { data: ops } = await supabaseAdmin.from("operators").select("setor_id");
  const counts = new Map<string, number>();
  for (const op of ops ?? []) {
    const sid = (op as { setor_id: string | null }).setor_id;
    if (sid) counts.set(sid, (counts.get(sid) ?? 0) + 1);
  }

  return (setores ?? []).map((s) => ({ ...s, operatorCount: counts.get(s.id) ?? 0 }));
});

const createSchema = z.object({ name: z.string().min(1).max(60) });

export const createSetor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requirePermission("manage_setores")])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("setores")
      .insert({ name: data.name.trim() })
      .select("id, name, created_at")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

const updateSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(60) });

export const updateSetor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requirePermission("manage_setores")])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("setores")
      .update({ name: data.name.trim(), updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteSetor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requirePermission("manage_setores")])
  .inputValidator((input) => deleteSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("setores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const assignSchema = z.object({ operator_id: z.string().uuid(), setor_id: z.string().uuid().nullable() });

export const assignOperatorSetor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requirePermission("manage_operators")])
  .inputValidator((input) => assignSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("operators")
      .update({ setor_id: data.setor_id })
      .eq("id", data.operator_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- SLA por setor, horário comercial e alerta de WhatsApp — só admin. ---

async function recordHistory(
  supabaseAdmin: SupabaseClient<Database>,
  params: { setor_id: string; changed_by_user_id: string; changed_by_label: string; field: string; old_value: unknown; new_value: unknown },
) {
  const { error } = await supabaseAdmin.from("setor_config_history").insert({
    setor_id: params.setor_id,
    changed_by_user_id: params.changed_by_user_id,
    changed_by_label: params.changed_by_label,
    field: params.field,
    old_value: params.old_value as never,
    new_value: params.new_value as never,
  } as never);
  if (error) console.error("[setor_config_history] falha ao gravar:", error.message);
}

function adminLabel(context: unknown): { userId: string; label: string } {
  const ctx = context as { userId?: string; claims?: { email?: string } };
  return { userId: ctx.userId ?? "", label: ctx.claims?.email ?? ctx.userId ?? "admin" };
}

const slaSchema = z.object({
  setor_id: z.string().uuid(),
  sla_minutes: z.number().int().min(1).max(100_000).nullable(),
});

export const updateSetorSla = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => slaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await supabaseAdmin.from("setores").select("sla_minutes").eq("id", data.setor_id).maybeSingle();

    const { error } = await supabaseAdmin
      .from("setores")
      .update({ sla_minutes: data.sla_minutes, updated_at: new Date().toISOString() } as never)
      .eq("id", data.setor_id);
    if (error) throw new Error(error.message);

    const { userId, label } = adminLabel(context);
    await recordHistory(supabaseAdmin, {
      setor_id: data.setor_id,
      changed_by_user_id: userId,
      changed_by_label: label,
      field: "sla_minutes",
      old_value: (current as { sla_minutes: number | null } | null)?.sla_minutes ?? null,
      new_value: data.sla_minutes,
    });

    return { ok: true };
  });

const businessHoursSchema = z.object({
  setor_id: z.string().uuid(),
  business_days: z.array(z.number().int().min(0).max(6)).min(1),
  business_start_minutes: z.number().int().min(0).max(24 * 60 - 1),
  business_end_minutes: z.number().int().min(0).max(24 * 60 - 1),
});

export const updateSetorBusinessHours = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => businessHoursSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await supabaseAdmin
      .from("setores")
      .select("business_days, business_start_minutes, business_end_minutes")
      .eq("id", data.setor_id)
      .maybeSingle();

    const daysStr = [...new Set(data.business_days)].sort((a, b) => a - b).join(",");
    const { error } = await supabaseAdmin
      .from("setores")
      .update({
        business_days: daysStr,
        business_start_minutes: data.business_start_minutes,
        business_end_minutes: data.business_end_minutes,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.setor_id);
    if (error) throw new Error(error.message);

    const { userId, label } = adminLabel(context);
    await recordHistory(supabaseAdmin, {
      setor_id: data.setor_id,
      changed_by_user_id: userId,
      changed_by_label: label,
      field: "business_hours",
      old_value: current ?? null,
      new_value: { business_days: daysStr, business_start_minutes: data.business_start_minutes, business_end_minutes: data.business_end_minutes },
    });

    return { ok: true };
  });

const alertNumberSchema = z.object({ setor_id: z.string().uuid(), alert_whatsapp_number: z.string().max(30).nullable() });

export const updateSetorAlertNumber = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => alertNumberSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await supabaseAdmin
      .from("setores")
      .select("alert_whatsapp_number")
      .eq("id", data.setor_id)
      .maybeSingle();

    const clean = data.alert_whatsapp_number?.trim() || null;
    const { error } = await supabaseAdmin
      .from("setores")
      .update({ alert_whatsapp_number: clean, updated_at: new Date().toISOString() } as never)
      .eq("id", data.setor_id);
    if (error) throw new Error(error.message);

    const { userId, label } = adminLabel(context);
    await recordHistory(supabaseAdmin, {
      setor_id: data.setor_id,
      changed_by_user_id: userId,
      changed_by_label: label,
      field: "alert_whatsapp_number",
      old_value: (current as { alert_whatsapp_number: string | null } | null)?.alert_whatsapp_number ?? null,
      new_value: clean,
    });

    return { ok: true };
  });

const historySchema = z.object({ setor_id: z.string().uuid() });

export const listSetorHistory = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => historySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("setor_config_history")
      .select("id, changed_by_label, field, old_value, new_value, created_at")
      .eq("setor_id", data.setor_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
