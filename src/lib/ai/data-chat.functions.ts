import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

export const askDataChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = (context as { userId?: string }).userId ?? null;

    // Escopo: operador vê só os próprios dados; admin vê tudo.
    let operatorId: string | null = null;
    if (userId) {
      const { data: setting } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "super_admin_emails")
        .maybeSingle();
      let superAdmins: string[] = [];
      try {
        superAdmins = JSON.parse(setting?.value ?? "[]");
      } catch {
        superAdmins = [];
      }
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = (authUser?.user?.email ?? "").toLowerCase();
      const isSuperAdmin = superAdmins.map((e) => e.toLowerCase()).includes(email);
      if (!isSuperAdmin) {
        const { data: op } = await supabaseAdmin
          .from("operators")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        operatorId = op?.id ?? null;
      }
    }

    const { askDataChatServer } = await import("@/lib/ai/data-chat.server");
    return askDataChatServer(data.messages, operatorId);
  });
