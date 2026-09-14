import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/auth/require-admin";
import { requirePermission } from "@/lib/auth/require-permission";
import { z } from "zod";

async function resolveMyOperatorId(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("operators").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

// Operadores com a permissão "campanhas" veem só as próprias — filtra pelos
// envios (campaign_sends) que têm esse operator_id; admins veem tudo.
export const listCampaigns = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth, requirePermission("campanhas")]).handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const myOpId = await resolveMyOperatorId((context as { userId?: string }).userId);

  const { data: campaigns, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  let sendsQuery = supabaseAdmin.from("campaign_sends").select("campaign_id, replied, operator_id");
  if (myOpId) sendsQuery = sendsQuery.eq("operator_id", myOpId);
  const { data: sends } = await sendsQuery;

  const stats = new Map<string, { sent: number; replied: number }>();
  for (const s of sends ?? []) {
    const cur = stats.get(s.campaign_id) ?? { sent: 0, replied: 0 };
    cur.sent++;
    if (s.replied) cur.replied++;
    stats.set(s.campaign_id, cur);
  }

  const visible = myOpId ? (campaigns ?? []).filter((c) => stats.has(c.id)) : campaigns ?? [];

  return visible.map((c) => {
    const st = stats.get(c.id) ?? { sent: 0, replied: 0 };
    return {
      ...c,
      sent: st.sent,
      replied: st.replied,
      conversionRate: st.sent ? Math.round((st.replied / st.sent) * 1000) / 10 : 0,
    };
  });
});

export const getCampaignDetail = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth, requirePermission("campanhas")])
  .inputValidator((input) => z.object({ campaign_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const myOpId = await resolveMyOperatorId((context as { userId?: string }).userId);
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("id, name, created_at")
      .eq("id", data.campaign_id)
      .maybeSingle();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) throw new Error("Campanha não encontrada");

    let sendsQuery = supabaseAdmin
      .from("campaign_sends")
      .select("id, operator_id, lead_phone, lead_name, message_text, sent_at, replied, replied_at, operators(name, instance_name)")
      .eq("campaign_id", data.campaign_id)
      .order("sent_at", { ascending: false });
    if (myOpId) sendsQuery = sendsQuery.eq("operator_id", myOpId);
    const { data: sends, error: sendsError } = await sendsQuery;
    if (sendsError) throw new Error(sendsError.message);

    return { campaign, sends: sends ?? [] };
  });

const renameSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(120) });

export const renameCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => renameSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({ name: data.name.trim(), updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireAdmin])
  .inputValidator((input) => deleteSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
