import { createMiddleware } from "@tanstack/react-start";
import { PERMISSION_COLUMN, PERMISSION_DEFAULTS, type PermissionKey } from "@/lib/permissions/permission-defaults";

/**
 * Must run after requireSupabaseAuth (needs context.userId). Contas sem
 * vínculo em `operators` são tratadas como admin (mesmo critério do
 * requireAdmin) e passam direto, sem restrição. Contas de operador só
 * passam se a coluna correspondente em `operator_permissions` for true;
 * se o operador ainda não tem linha na tabela, usa PERMISSION_DEFAULTS.
 */
export function requirePermission(key: PermissionKey) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const userId = (context as unknown as { userId?: string }).userId;
    if (!userId) throw new Error("Unauthorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: op } = await supabaseAdmin
      .from("operators")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!op) {
      return next({ context });
    }

    const column = PERMISSION_COLUMN[key];
    const { data: perm } = await supabaseAdmin
      .from("operator_permissions")
      .select(column)
      .eq("operator_id", op.id)
      .maybeSingle();

    const allowed = perm ? Boolean((perm as Record<string, boolean>)[column]) : PERMISSION_DEFAULTS[column];
    if (!allowed) {
      throw new Error("Você não tem permissão para acessar este recurso.");
    }

    return next({ context });
  });
}
