import { createMiddleware } from "@tanstack/react-start";

/**
 * Must run after requireSupabaseAuth in the middleware chain (needs
 * context.userId). Operators are identified the same way getMyProfile does:
 * a row in `operators` linked to this user_id. Anyone without one is treated
 * as an admin — this app has no separate admin role table.
 */
export const requireAdmin = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const userId = (context as unknown as { userId?: string }).userId;
    if (!userId) throw new Error("Unauthorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: op } = await supabaseAdmin
      .from("operators")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (op) {
      throw new Error("Acesso restrito a administradores.");
    }

    return next({ context });
  },
);
