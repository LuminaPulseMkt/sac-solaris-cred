import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getMyOperatorRow(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("operators")
    .select("id, name, instance_name, channel, status, webhook_url, token, email")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = (context as { userId?: string }).userId;
    if (!userId) return { role: "admin" as const, operator: null, email: "" };

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
    const email = authUser?.user?.email ?? "";

    if (email && superAdmins.map((e) => e.toLowerCase()).includes(email.toLowerCase())) {
      return { role: "admin" as const, operator: null, email };
    }

    const operator = await getMyOperatorRow(userId);
    if (operator) {
      return { role: "operator" as const, operator, email };
    }

    return { role: "admin" as const, operator: null, email };
  });

export const listOperatorsWithAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("operators")
      .select("id, name, instance_name, channel, status, user_id, email, last_received_at")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((op) => ({ ...op, hasAccess: !!op.user_id }));
  });

function generateStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$!&";
  const all = upper + lower + digits + special;
  let pwd = "";
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < 12; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

export const createOperatorUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        operator_id: z.string().uuid(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("operators")
      .select("user_id, name")
      .eq("id", data.operator_id)
      .maybeSingle();
    if (existing?.user_id) {
      throw new Error("Este operador já tem um usuário vinculado. Revogue o acesso antes.");
    }

    const operatorName = existing?.name ?? "operador";
    const firstName = operatorName.split(/\s+/)[0] ?? "operador";
    const slug = firstName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    const generatedEmail = data.email ?? `${slug || "operador"}cred@sac.solaris`;
    const generatedPassword = data.password ?? generateStrongPassword();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: generatedEmail,
      password: generatedPassword,
      email_confirm: true,
    });
    if (authError || !authData?.user) {
      throw new Error(`Erro ao criar usuário: ${authError?.message ?? "desconhecido"}`);
    }

    const userId = authData.user.id;

    const { error: opError } = await supabaseAdmin
      .from("operators")
      .update({ user_id: userId, email: generatedEmail })
      .eq("id", data.operator_id);
    if (opError) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(`Erro ao vincular operador: ${opError.message}`);
    }

    let emailSent = false;
    let emailError: string | null = null;
    if (data.email) {
      const { sendEmail } = await import("@/lib/email/resend.server");
      const result = await sendEmail({
        to: generatedEmail,
        subject: `Seu acesso ao SAC — ${operatorName}`,
        html: `
          <p>Olá, ${operatorName}!</p>
          <p>Seu acesso ao painel SAC (Solaris Analytics Chat) foi criado. Use os dados abaixo para entrar:</p>
          <p><strong>Link:</strong> <a href="https://sac.renassolnuvem.tech">https://sac.renassolnuvem.tech</a></p>
          <p><strong>E-mail:</strong> ${generatedEmail}</p>
          <p><strong>Senha:</strong> ${generatedPassword}</p>
          <p>Recomendamos alterar a senha após o primeiro acesso.</p>
        `,
      });
      emailSent = result.ok;
      emailError = result.ok ? null : (result.error ?? "Falha desconhecida ao enviar e-mail");
    }

    return {
      userId,
      email: generatedEmail,
      password: generatedPassword,
      generated: !data.email,
      emailSent,
      emailError,
    };
  });


export const updateOperatorPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        operator_id: z.string().uuid(),
        new_password: z.string().min(6),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: op } = await supabaseAdmin
      .from("operators")
      .select("user_id")
      .eq("id", data.operator_id)
      .maybeSingle();
    if (!op?.user_id) throw new Error("Operador sem usuário vinculado");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(op.user_id, {
      password: data.new_password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeOperatorAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ operator_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: op } = await supabaseAdmin
      .from("operators")
      .select("user_id")
      .eq("id", data.operator_id)
      .maybeSingle();
    if (op?.user_id) {
      await supabaseAdmin.auth.admin.deleteUser(op.user_id).catch(() => {});
    }
    await supabaseAdmin
      .from("operators")
      .update({ user_id: null, email: null })
      .eq("id", data.operator_id);
    return { ok: true };
  });

const createCollaboratorSchema = z.object({
  name: z.string().min(1),
  instance_name: z.string().min(1),
  channel: z.string().default("whatsapp"),
  description: z.string().optional().nullable(),
  setor_id: z.string().uuid().nullable().optional(),
  email: z.string().email(),
});

export const createCollaborator = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => createCollaboratorSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin
      .from("operators")
      .insert({
        name: data.name,
        instance_name: data.instance_name,
        channel: data.channel,
        description: data.description ?? null,
        status: "pending",
        setor_id: data.setor_id ?? null,
      } as never)
      .select()
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao criar operador");

    const webhookUrl = `https://sac.renassolnuvem.tech/api/public/webhook/recv/${created.token}`;
    await supabaseAdmin.from("operators").update({ webhook_url: webhookUrl }).eq("id", created.id);

    const { data: evoRows } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["evolution_api_url", "evolution_api_key"]);
    const evoMap: Record<string, string> = {};
    for (const r of evoRows ?? []) evoMap[r.key] = r.value ?? "";
    const evoUrl = (evoMap.evolution_api_url ?? "").replace(/\/+$/, "");
    const evoKey = evoMap.evolution_api_key ?? "";

    if (!evoUrl || !evoKey) {
      await supabaseAdmin.from("operators").delete().eq("id", created.id);
      throw new Error("Evolution API não configurada (Configurações → Integrações).");
    }

    try {
      const createRes = await fetch(`${evoUrl}/instance/create`, {
        method: "POST",
        headers: { apikey: evoKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceName: data.instance_name,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });
      if (!createRes.ok) {
        const txt = await createRes.text();
        throw new Error(`HTTP ${createRes.status}: ${txt.slice(0, 200)}`);
      }

      await fetch(`${evoUrl}/webhook/set/${encodeURIComponent(data.instance_name)}`, {
        method: "POST",
        headers: { apikey: evoKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook: {
            url: webhookUrl,
            enabled: true,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
            webhookByEvents: false,
            base64: false,
          },
        }),
      }).catch(() => {});
    } catch (e) {
      await supabaseAdmin.from("operators").delete().eq("id", created.id);
      throw new Error(
        `Falha ao criar instância na Evolution API: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const generatedPassword = generateStrongPassword();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: generatedPassword,
      email_confirm: true,
    });

    let emailSent = false;
    let emailError: string | null = null;

    if (authError || !authData?.user) {
      emailError = `Instância criada, mas falha ao criar login: ${authError?.message ?? "erro desconhecido"}`;
    } else {
      await supabaseAdmin
        .from("operators")
        .update({ user_id: authData.user.id, email: data.email })
        .eq("id", created.id);

      const { sendEmail } = await import("@/lib/email/resend.server");
      const result = await sendEmail({
        to: data.email,
        subject: `Seu acesso ao SAC — ${data.name}`,
        html: `
          <p>Olá, ${data.name}!</p>
          <p>Seu acesso ao painel SAC (Solaris Analytics Chat) foi criado. Use os dados abaixo para entrar:</p>
          <p><strong>Link:</strong> <a href="https://sac.renassolnuvem.tech">https://sac.renassolnuvem.tech</a></p>
          <p><strong>E-mail:</strong> ${data.email}</p>
          <p><strong>Senha:</strong> ${generatedPassword}</p>
          <p>Recomendamos alterar a senha após o primeiro acesso.</p>
          <p>Para conectar o WhatsApp da sua instância, peça para quem cadastrou você escanear o QR code na tela de Integração do SAC.</p>
        `,
      });
      emailSent = result.ok;
      if (!result.ok) emailError = result.error ?? "Falha desconhecida ao enviar e-mail";
    }

    return {
      operator: { ...created, webhook_url: webhookUrl },
      password: generatedPassword,
      email: data.email,
      emailSent,
      emailError,
    };
  });
