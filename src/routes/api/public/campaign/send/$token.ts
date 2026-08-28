import { createFileRoute } from "@tanstack/react-router";

type CampaignSendPayload = {
  campaign_name?: string;
  lead_phone?: string;
  lead_name?: string;
  message_text?: string;
};

export const Route = createFileRoute("/api/public/campaign/send/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token = params.token;

        let payload: CampaignSendPayload;
        try {
          payload = (await request.json()) as CampaignSendPayload;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const campaignName = payload.campaign_name?.trim();
        const leadPhone = payload.lead_phone?.trim();
        if (!campaignName || !leadPhone) {
          return Response.json({ error: "campaign_name e lead_phone são obrigatórios" }, { status: 400 });
        }

        const { data: operator } = await supabaseAdmin
          .from("operators")
          .select("id, status")
          .eq("token", token)
          .maybeSingle();
        if (!operator) {
          return Response.json({ error: "Invalid token" }, { status: 401 });
        }
        if (operator.status === "inactive") {
          return Response.json({ error: "Operator inactive" }, { status: 403 });
        }

        const { data: campaign, error: campaignError } = await supabaseAdmin
          .from("campaigns")
          .upsert({ name: campaignName }, { onConflict: "name", ignoreDuplicates: false })
          .select("id")
          .single();
        if (campaignError || !campaign) {
          return Response.json({ error: campaignError?.message ?? "Falha ao criar campanha" }, { status: 500 });
        }

        const { data: send, error: sendError } = await supabaseAdmin
          .from("campaign_sends")
          .insert({
            campaign_id: campaign.id,
            operator_id: operator.id,
            lead_phone: leadPhone,
            lead_name: payload.lead_name?.trim() || null,
            message_text: payload.message_text ?? null,
          })
          .select("id")
          .single();
        if (sendError || !send) {
          return Response.json({ error: sendError?.message ?? "Falha ao registrar envio" }, { status: 500 });
        }

        return Response.json({ ok: true, campaign_id: campaign.id, send_id: send.id });
      },
    },
  },
});
