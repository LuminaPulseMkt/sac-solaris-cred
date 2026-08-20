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
