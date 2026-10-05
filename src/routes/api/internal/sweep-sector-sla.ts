import { createFileRoute } from "@tanstack/react-router";

const BATCH_SIZE_PER_SETOR = 50;

type Setor = {
  id: string;
  name: string;
  sla_minutes: number | null;
  business_days: string;
  business_start_minutes: number;
  business_end_minutes: number;
  business_timezone: string;
  alert_whatsapp_number: string | null;
};

export const Route = createFileRoute("/api/internal/sweep-sector-sla")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: secretRow } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "internal_sweep_secret")
          .maybeSingle();
        const expected = secretRow?.value ?? "";
        const provided = request.headers.get("x-sweep-secret") ?? "";
        if (!expected || provided !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { businessMinutesElapsed, isWithinBusinessHours } = await import("@/lib/sac/business-hours");

        const { data: setores } = await supabaseAdmin
          .from("setores")
          .select(
            "id, name, sla_minutes, business_days, business_start_minutes, business_end_minutes, business_timezone, alert_whatsapp_number",
          )
          .not("sla_minutes", "is", null);

        const setorList = (setores ?? []) as Setor[];
        if (setorList.length === 0) {
          return Response.json({ detected: 0, sent: 0, setores: 0 });
        }

        const configFor = (s: Setor) => ({
          enabled: true,
          startMinutes: s.business_start_minutes,
          endMinutes: s.business_end_minutes,
          days: s.business_days
            .split(",")
            .map((d) => Number(d.trim()))
            .filter((d) => Number.isInteger(d)),
          timezone: s.business_timezone,
        });

        // 1) Detecta novas conversas que estouraram o SLA do seu setor.
        let detected = 0;
        for (const setor of setorList) {
          if (!setor.sla_minutes) continue;
          const config = configFor(setor);

          const { data: opsInSetor } = await supabaseAdmin.from("operators").select("id").eq("setor_id", setor.id);
          const opIds = (opsInSetor ?? []).map((o) => (o as { id: string }).id);
          if (opIds.length === 0) continue;

          const { data: convs } = await supabaseAdmin
            .from("conversations")
            .select("id, operator_id, lead_name, lead_phone, setor_assigned_at")
            .eq("status", "ongoing")
            .in("operator_id", opIds)
            .limit(BATCH_SIZE_PER_SETOR * 3);

          const candidates = (convs ?? []) as Array<{
            id: string;
            operator_id: string;
            lead_name: string | null;
            lead_phone: string;
            setor_assigned_at: string | null;
          }>;
          if (candidates.length === 0) continue;

          const { data: already } = await supabaseAdmin
            .from("setor_sla_alerts")
            .select("conversation_id")
            .in(
              "conversation_id",
              candidates.map((c) => c.id),
            );
          const alreadySet = new Set((already ?? []).map((a) => (a as { conversation_id: string }).conversation_id));

          const now = new Date();
          const toInsert: Array<{ conversation_id: string; setor_id: string; breached_at: string }> = [];
          for (const c of candidates) {
            if (alreadySet.has(c.id) || !c.setor_assigned_at) continue;
            const elapsed = businessMinutesElapsed(c.setor_assigned_at, now, config);
            if (elapsed >= setor.sla_minutes) {
              toInsert.push({ conversation_id: c.id, setor_id: setor.id, breached_at: now.toISOString() });
              if (toInsert.length >= BATCH_SIZE_PER_SETOR) break;
            }
          }

          if (toInsert.length > 0) {
            const { error: insErr } = await supabaseAdmin
              .from("setor_sla_alerts")
              .upsert(toInsert as never, { onConflict: "conversation_id", ignoreDuplicates: true });
            if (insErr) console.error("[sweep-sector-sla] falha ao gravar fila:", insErr.message);
            else detected += toInsert.length;
          }
        }

        // 2) Envia (ou mantém na fila) os alertas pendentes, só dentro do
        //    horário comercial do setor de cada um.
        const { data: pending } = await supabaseAdmin
          .from("setor_sla_alerts")
          .select("id, conversation_id, setor_id, breached_at")
          .eq("status", "pending")
          .limit(200);

        const pendingRows = (pending ?? []) as Array<{ id: string; conversation_id: string; setor_id: string; breached_at: string }>;
        if (pendingRows.length === 0) {
          return Response.json({ detected, sent: 0, setores: setorList.length });
        }

        const setorById = new Map(setorList.map((s) => [s.id, s]));
        const convIds = [...new Set(pendingRows.map((p) => p.conversation_id))];
        const { data: convRows } = await supabaseAdmin
          .from("conversations")
          .select("id, lead_name, lead_phone, operator_id")
          .in("id", convIds);
        const convById = new Map((convRows ?? []).map((c) => [(c as { id: string }).id, c as { id: string; lead_name: string | null; lead_phone: string; operator_id: string }]));

        const { data: evoRows } = await supabaseAdmin
          .from("app_settings")
          .select("key,value")
          .in("key", ["evolution_api_url", "evolution_api_key", "sla_alert_evolution_instance"]);
        const evoMap: Record<string, string> = {};
        for (const r of evoRows ?? []) evoMap[r.key] = r.value ?? "";
        const evoUrl = (evoMap.evolution_api_url ?? "").replace(/\/+$/, "");
        const evoKey = evoMap.evolution_api_key ?? "";
        const evoInstance = evoMap.sla_alert_evolution_instance ?? "";

        let sent = 0;
        for (const p of pendingRows) {
          const setor = setorById.get(p.setor_id);
          if (!setor || !setor.alert_whatsapp_number) continue;
          const config = configFor(setor);
          if (!isWithinBusinessHours(new Date(), config)) continue; // fica na fila pro próximo expediente

          if (!evoUrl || !evoKey || !evoInstance) continue; // sem envio configurado, mas segue "pending"

          const conv = convById.get(p.conversation_id);
          const leadLabel = conv?.lead_name || conv?.lead_phone || "—";
          const text = [
            `⏱️ *SLA estourado — ${setor.name}*`,
            "",
            `Conversa com ${leadLabel} está sem resposta além do limite de ${setor.sla_minutes} min (contando só horário comercial).`,
            "",
            "_Alerta automático do Solaris Analytics Chat_",
          ].join("\n");

          try {
            const res = await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(evoInstance)}`, {
              method: "POST",
              headers: { apikey: evoKey, "Content-Type": "application/json" },
              body: JSON.stringify({ number: setor.alert_whatsapp_number, text }),
            });
            if (res.ok) {
              await supabaseAdmin
                .from("setor_sla_alerts")
                .update({ status: "sent", sent_at: new Date().toISOString() } as never)
                .eq("id", p.id);
              sent++;
            } else {
              console.error("[sweep-sector-sla] falha ao enviar WhatsApp:", res.status, await res.text());
            }
          } catch (e) {
            console.error("[sweep-sector-sla] erro ao enviar WhatsApp:", e instanceof Error ? e.message : e);
          }
        }

        return Response.json({ detected, sent, setores: setorList.length, pending: pendingRows.length });
      },
    },
  },
});
