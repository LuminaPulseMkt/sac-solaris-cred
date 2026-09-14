import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/auth/require-admin";
import { z } from "zod";
import { PERMISSION_DEFAULTS, type OperatorPermissions } from "@/lib/permissions/permission-defaults";

function toOperatorPermissions(row: Record<string, unknown> | null | undefined): OperatorPermissions {
  if (!row) return PERMISSION_DEFAULTS;
  return {
    can_view_dashboard: Boolean(row.can_view_dashboard),
    can_view_conversas: Boolean(row.can_view_conversas),
    can_view_alertas: Boolean(row.can_view_alertas),
    can_view_relatorios: Boolean(row.can_view_relatorios),
    can_view_campanhas: Boolean(row.can_view_campanhas),
    can_delete_conversations: Boolean(row.can_delete_conversations),
    can_view_ai_analysis: Boolean(row.can_view_ai_analysis),
    can_send_report_email: Boolean(row.can_send_report_email),
    can_manage_operators: Boolean(row.can_manage_operators),
    can_manage_setores: Boolean(row.can_manage_setores),
    can_manage_access: Boolean(row.can_manage_access),
  };
}

// Usado pelo próprio usuário logado (sidebar, gates de UI). Admin sempre
// isAdmin:true / permissions:null (sem restrição nenhuma).
export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId?: string }).userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: op } = await supabaseAdmin
      .from("operators")
      .select("id")
      .eq("user_id", userId ?? "")
      .maybeSingle();
    if (!op) return { isAdmin: true as const, permissions: null };

    const { data: perm } = await supabaseAdmin
      .from("operator_permissions")
      .select("*")
      .eq("operator_id", op.id)
      .maybeSingle();
    return { isAdmin: false as const, permissions: toOperatorPermissions(perm) };
  });

// Usado pela aba "Permissões" em Integração — lista todos os operadores com
// suas permissões atuais (defaults preenchidos quando não há linha ainda).
export const listOperatorsPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: operators, error } = await supabaseAdmin
      .from("operators")
      .select("id, name, instance_name, setor_id, setores(name)")
      .order("name");
    if (error) throw new Error(error.message);

    const { data: perms } = await supabaseAdmin.from("operator_permissions").select("*");
    const byOperator = new Map((perms ?? []).map((p) => [(p as { operator_id: string }).operator_id, p]));

    return (operators ?? []).map((op) => ({
      id: op.id,
      name: op.name,
      instance_name: op.instance_name,
      setor_name: (op as unknown as { setores?: { name?: string } | null }).setores?.name ?? null,
      permissions: toOperatorPermissions(byOperator.get(op.id) as Record<string, unknown> | undefined),
    }));
  });

const updateSchema = z.object({
  operator_id: z.string().uuid(),
  can_view_dashboard: z.boolean().optional(),
  can_view_conversas: z.boolean().optional(),
  can_view_alertas: z.boolean().optional(),
  can_view_relatorios: z.boolean().optional(),
  can_view_campanhas: z.boolean().optional(),
  can_delete_conversations: z.boolean().optional(),
  can_view_ai_analysis: z.boolean().optional(),
  can_send_report_email: z.boolean().optional(),
  can_manage_operators: z.boolean().optional(),
  can_manage_setores: z.boolean().optional(),
  can_manage_access: z.boolean().optional(),
});

export const updateOperatorPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data }) => {
    const { operator_id, ...patch } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("operator_permissions")
      .upsert({ operator_id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "operator_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
