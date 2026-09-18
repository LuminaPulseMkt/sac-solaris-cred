import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/auth/require-admin";
import { z } from "zod";

export const listBlacklistedNumbers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth, requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("blacklisted_numbers")
    .select("id, phone_number, label, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const addSchema = z.object({
  phone_number: z.string().trim().regex(/^\d{8,15}$/, "Use só números, com DDI+DDD (ex: 5511999990001)"),
  label: z.string().trim().optional().nullable(),
});

export const addBlacklistedNumber = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => addSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("blacklisted_numbers")
      .insert({ phone_number: data.phone_number, label: data.label || null })
      .select("id, phone_number, label, created_at")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

const removeSchema = z.object({ id: z.string().uuid() });

export const removeBlacklistedNumber = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => removeSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("blacklisted_numbers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
