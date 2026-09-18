import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/auth/require-permission";
import { z } from "zod";

async function resolveMyOperatorId(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("operators").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

export const listShareGrants = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth, requirePermission("manage_access")]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("conversation_share_grants")
    .select(
      "id, owner_operator_id, viewer_operator_id, created_at, " +
        "owner:operators!conversation_share_grants_owner_operator_id_fkey(name), " +
        "viewer:operators!conversation_share_grants_viewer_operator_id_fkey(name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const grantSchema = z.object({ owner_operator_id: z.string().uuid(), viewer_operator_id: z.string().uuid() });

export const createShareGrant = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requirePermission("manage_access")])
  .inputValidator((input) => grantSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.owner_operator_id === data.viewer_operator_id) throw new Error("Não é possível compartilhar consigo mesmo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("conversation_share_grants").insert(data as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteShareGrant = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requirePermission("manage_access")])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("conversation_share_grants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const replySchema = z.object({ conversation_id: z.string().uuid(), text: z.string().trim().min(1).max(4096) });

// Manda uma mensagem de texto de verdade pro lead, usando a instância
// WhatsApp do DONO da conversa — quem chama pode ser o próprio dono, quem
// tem um grant de acesso compartilhado pra essa conversa, ou um admin.
export const sendConversationReply = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => replySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = (context as { userId?: string }).userId;

    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("id, operator_id, remote_jid")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");

    const myOpId = await resolveMyOperatorId(userId);
    if (myOpId && conv.operator_id !== myOpId) {
      const { data: grant } = await supabaseAdmin
        .from("conversation_share_grants")
        .select("id")
        .eq("owner_operator_id", conv.operator_id)
        .eq("viewer_operator_id", myOpId)
        .maybeSingle();
      if (!grant) throw new Error("Você não tem acesso a esta conversa");
    }

    const { data: owner } = await supabaseAdmin
      .from("operators")
      .select("instance_name")
      .eq("id", conv.operator_id)
      .maybeSingle();
    if (!owner) throw new Error("Operador dono da conversa não encontrado");

    const { data: evoRows } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["evolution_api_url", "evolution_api_key"]);
    const evoMap: Record<string, string> = {};
    for (const r of evoRows ?? []) evoMap[r.key] = r.value ?? "";
    const url = (evoMap.evolution_api_url ?? "").replace(/\/+$/, "");
    const apiKey = evoMap.evolution_api_key ?? "";
    if (!url || !apiKey) throw new Error("Evolution API não configurada (Configurações → Integrações).");

    const number = conv.remote_jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
    const res = await fetch(`${url}/message/sendText/${encodeURIComponent(owner.instance_name)}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text: data.text }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Erro ao enviar mensagem: HTTP ${res.status} — ${txt.slice(0, 200)}`);
    }

    const { error: msgError } = await supabaseAdmin.from("messages").insert({
      conversation_id: conv.id,
      operator_id: conv.operator_id,
      from_role: "operator",
      message_text: data.text,
      message_type: "text",
      sent_at: new Date().toISOString(),
    } as never);
    if (msgError) console.error("[sendConversationReply] falha ao gravar no histórico:", msgError.message);

    return { ok: true };
  });
