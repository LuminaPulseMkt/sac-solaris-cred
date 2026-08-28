import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listCampaigns = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: campaigns, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: sends } = await supabaseAdmin
    .from("campaign_sends")
    .select("campaign_id, replied");

  const stats = new Map<string, { sent: number; replied: number }>();
  for (const s of sends ?? []) {
    const cur = stats.get(s.campaign_id) ?? { sent: 0, replied: 0 };
    cur.sent++;
    if (s.replied) cur.replied++;
    stats.set(s.campaign_id, cur);
  }

  return (campaigns ?? []).map((c) => {
    const st = stats.get(c.id) ?? { sent: 0, replied: 0 };
    return {
      ...c,
      sent: st.sent,
      replied: st.replied,
      conversionRate: st.sent ? Math.round((st.replied / st.sent) * 1000) / 10 : 0,
    };
  });
});

export const getCampaignDetail = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaign_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("id, name, created_at")
      .eq("id", data.campaign_id)
      .maybeSingle();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) throw new Error("Campanha não encontrada");

    const { data: sends, error: sendsError } = await supabaseAdmin
      .from("campaign_sends")
      .select("id, operator_id, lead_phone, lead_name, message_text, sent_at, replied, replied_at, operators(name, instance_name)")
      .eq("campaign_id", data.campaign_id)
      .order("sent_at", { ascending: false });
    if (sendsError) throw new Error(sendsError.message);

    return { campaign, sends: sends ?? [] };
  });

const renameSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(120) });

export const renameCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
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

export const deleteCampaign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
