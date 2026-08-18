// Server-only Resend client. Reads config from app_settings (same pattern as
// OpenAI/Evolution) so keys stay out of the client bundle and env vars.

async function getSettingValue(key: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? "";
}

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
};

export type SendEmailResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = await getSettingValue("resend_api_key");
  const from = await getSettingValue("resend_from_email");

  if (!apiKey || !from) {
    return { ok: false, error: "Resend não configurado (API Key ou e-mail remetente ausente em Configurações → Integrações)." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }

    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro desconhecido ao enviar e-mail." };
  }
}
