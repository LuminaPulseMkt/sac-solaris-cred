import { createFileRoute } from "@tanstack/react-router";

const BATCH_SIZE_PER_RULE = 50;

type Rule = { id: string; metric: string; threshold_minutes: number };

export const Route = createFileRoute("/api/internal/sweep-sla")({
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

        const { data: rules } = await supabaseAdmin
          .from("sla_rules")
          .select("id, metric, threshold_minutes")
          .eq("active", true);

        if (!rules || rules.length === 0) {
          return Response.json({ notified: 0, breaches: 0, rules: 0 });
        }

        // conversation_id -> lista de { rule, conversation } estourados
        type Breach = { rule: Rule; conversation: { id: string; operator_id: string; lead_name: string | null; lead_phone: string } };
        const breaches: Breach[] = [];

        for (const rule of rules as Rule[]) {
          const cutoff = new Date(Date.now() - rule.threshold_minutes * 60 * 1000).toISOString();

          if (rule.metric === "no_response") {
            const { data: convs } = await supabaseAdmin
              .from("conversations")
              .select("id, operator_id, lead_name, lead_phone")
              .eq("status", "ongoing")
              .lt("updated_at", cutoff)
              .limit(BATCH_SIZE_PER_RULE);
            for (const c of convs ?? []) breaches.push({ rule, conversation: c });
          } else if (rule.metric === "resolution") {
            const { data: convs } = await supabaseAdmin
              .from("conversations")
              .select("id, operator_id, lead_name, lead_phone")
              .eq("status", "ongoing")
              .lt("started_at", cutoff)
              .limit(BATCH_SIZE_PER_RULE);
            for (const c of convs ?? []) breaches.push({ rule, conversation: c });
          } else if (rule.metric === "first_response") {
            // Ongoing, iniciada há mais tempo que o limite, e nenhuma
            // mensagem do operador ainda (ninguém respondeu o lead).
            const { data: convs } = await supabaseAdmin
              .from("conversations")
              .select("id, operator_id, lead_name, lead_phone")
              .eq("status", "ongoing")
              .lt("started_at", cutoff)
              .limit(BATCH_SIZE_PER_RULE * 3); // sobra pra filtrar as que já tiveram resposta
            const candidates = convs ?? [];
            if (candidates.length > 0) {
              const { data: opMsgs } = await supabaseAdmin
                .from("messages")
                .select("conversation_id")
                .eq("from_role", "operator")
                .in("conversation_id", candidates.map((c) => c.id));
              const respondedIds = new Set((opMsgs ?? []).map((m) => m.conversation_id));
              for (const c of candidates) {
                if (!respondedIds.has(c.id)) breaches.push({ rule, conversation: c });
                if (breaches.length >= BATCH_SIZE_PER_RULE) break;
              }
            }
          }
        }

        if (breaches.length === 0) {
          return Response.json({ notified: 0, breaches: 0, rules: rules.length });
        }

        // Filtra as que já foram notificadas antes pra essa regra (dedup).
        const { data: already } = await supabaseAdmin
          .from("sla_notifications")
          .select("conversation_id, rule_id")
          .in("rule_id", rules.map((r) => r.id));
        const alreadySet = new Set((already ?? []).map((a) => `${a.conversation_id}:${a.rule_id}`));
        const fresh = breaches.filter((b) => !alreadySet.has(`${b.conversation.id}:${b.rule.id}`));

        if (fresh.length === 0) {
          return Response.json({ notified: 0, breaches: breaches.length, rules: rules.length });
        }

        // Resolve operador + gerente responsável (fallback: destinatários gerais de alerta).
        const operatorIds = [...new Set(fresh.map((b) => b.conversation.operator_id))];
        const { data: operators } = await supabaseAdmin
          .from("operators")
          .select("id, name, manager_id")
          .in("id", operatorIds);
        const opById = new Map((operators ?? []).map((o) => [o.id, o]));

        const managerIds = [...new Set((operators ?? []).map((o) => o.manager_id).filter((v): v is string => !!v))];
        const { data: managers } = managerIds.length
          ? await supabaseAdmin.from("operators").select("id, name, email").in("id", managerIds)
          : { data: [] as { id: string; name: string; email: string | null }[] };
        const managerById = new Map((managers ?? []).map((m) => [m.id, m]));

        const { data: fallbackRow } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "alert_notification_emails")
          .maybeSingle();
        let fallbackEmails: string[] = [];
        try {
          fallbackEmails = JSON.parse(fallbackRow?.value ?? "[]");
        } catch {
          fallbackEmails = [];
        }

        const metricLabel: Record<string, string> = {
          no_response: "Tempo sem resposta",
          first_response: "Tempo até a primeira resposta",
          resolution: "Tempo até a resolução",
        };

        // Agrupa por destinatário (gerente ou fallback geral).
        const byRecipient = new Map<string, { label: string; items: Breach[] }>();
        for (const b of fresh) {
          const op = opById.get(b.conversation.operator_id);
          const mgr = op?.manager_id ? managerById.get(op.manager_id) : null;
          const recipients = mgr?.email ? [mgr.email] : fallbackEmails;
          for (const email of recipients) {
            const key = email;
            const cur = byRecipient.get(key) ?? { label: mgr ? `gerente ${mgr.name}` : "destinatários gerais", items: [] };
            cur.items.push(b);
            byRecipient.set(key, cur);
          }
        }

        const { sendEmail } = await import("@/lib/email/resend.server");
        let notified = 0;
        for (const [email, group] of byRecipient) {
          const rows = group.items
            .map((b) => {
              const op = opById.get(b.conversation.operator_id);
              return `<tr><td>${metricLabel[b.rule.metric] ?? b.rule.metric}</td><td>${op?.name ?? "—"}</td><td>${b.conversation.lead_name ?? b.conversation.lead_phone}</td><td>${b.rule.threshold_minutes} min</td></tr>`;
            })
            .join("");
          const html = `
            <h2>⏱️ Alertas de SLA — SAC</h2>
            <p>${group.items.length} conversa(s) estourando o limite configurado:</p>
            <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
              <tr><th>Métrica</th><th>Operador</th><th>Lead</th><th>Limite</th></tr>
              ${rows}
            </table>
          `;
          const result = await sendEmail({ to: email, subject: `⏱️ ${group.items.length} alerta(s) de SLA — SAC`, html }).catch(() => null);
          if (result?.ok) notified++;
        }

        const { error: insErr } = await supabaseAdmin.from("sla_notifications").insert(
          fresh.map((b) => ({ conversation_id: b.conversation.id, rule_id: b.rule.id })) as never,
        );
        if (insErr) console.error("[sweep-sla] falha ao gravar dedup:", insErr.message);

        return Response.json({ notified, breaches: fresh.length, rules: rules.length });
      },
    },
  },
});
