import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/auth/require-admin";
import { z } from "zod";

export const listSlaRules = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth, requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("sla_rules")
    .select("id, metric, threshold_minutes, active")
    .order("metric");
  if (error) throw new Error(error.message);
  return data ?? [];
});

const updateSchema = z.object({
  id: z.string().uuid(),
  threshold_minutes: z.number().int().min(1).max(10_000).optional(),
  active: z.boolean().optional(),
});

export const updateSlaRule = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data }) => {
    const { id, ...patch } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sla_rules")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
