import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listSetores = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: setores, error } = await supabaseAdmin
    .from("setores")
    .select("id, name, created_at")
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

export const createSetor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
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

export const updateSetor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
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

export const deleteSetor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("setores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const assignSchema = z.object({ operator_id: z.string().uuid(), setor_id: z.string().uuid().nullable() });

export const assignOperatorSetor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
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
