import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SENSITIVE_KEYS = new Set(["openai_api_key", "evolution_api_key", "resend_api_key"]);

export type SettingsMap = Record<string, string>;

export type SafeSettings = {
  values: SettingsMap;
  sensitive: Record<string, { configured: boolean; lastFour: string | null }>;
};

export const getSettings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async (): Promise<SafeSettings> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_settings").select("key,value");
  if (error) throw new Error(error.message);

  const values: SettingsMap = {};
  const sensitive: SafeSettings["sensitive"] = {};
  for (const row of data ?? []) {
    const value = row.value ?? "";
    if (SENSITIVE_KEYS.has(row.key)) {
      sensitive[row.key] = {
        configured: value.trim().length > 0,
        lastFour: value.length >= 4 ? value.slice(-4) : null,
      };
      values[row.key] = "";
    } else {
      values[row.key] = value;
    }
  }
  return { values, sensitive };
});

const saveSchema = z.object({ key: z.string().min(1), value: z.string() });

export const saveSetting = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        { key: data.key, value: data.value, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testEvolutionConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key,value")
    .in("key", ["evolution_api_url", "evolution_api_key"]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value ?? "";
  const url = (map.evolution_api_url ?? "").replace(/\/+$/, "");
  const apiKey = map.evolution_api_key ?? "";
  if (!url || !apiKey) {
    return { success: false, status: 0, statusText: "", error: "URL ou API Key não configuradas", instances: [] as string[], url: "" };
  }
  const endpoint = `${url}/instance/fetchInstances`;
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text();
      return { success: false, status: res.status, statusText: res.statusText, error: `HTTP ${res.status}: ${txt.slice(0, 200)}`, instances: [], url: endpoint };
    }
    const json = (await res.json()) as unknown;
    const arr = Array.isArray(json) ? json : [];
    const instances = arr
      .map((it) => {
        if (typeof it !== "object" || it == null) return null;
        const o = it as Record<string, unknown>;
        const name = (o.name ?? o.instanceName ?? (o.instance as Record<string, unknown> | undefined)?.instanceName) as
          | string
          | undefined;
        return typeof name === "string" ? name : null;
      })
      .filter((n): n is string => !!n);
    return { success: true, status: res.status, statusText: res.statusText, instances, url: endpoint, error: null };
  } catch (e) {
    return { success: false, status: 0, statusText: "", error: e instanceof Error ? e.message : "Erro desconhecido", instances: [], url: endpoint };
  }
});

export const getActiveInstances = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("operators")
    .select("id, name, instance_name, channel")
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

const testResendSchema = z.object({ to: z.string().email() });

export const testResendEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => testResendSchema.parse(input))
  .handler(async ({ data }) => {
    const { sendEmail } = await import("@/lib/email/resend.server");
    return sendEmail({
      to: data.to,
      subject: "Teste de integração — SAC",
      html: "<p>Este é um e-mail de teste da integração Resend do SAC. Se você recebeu isso, está tudo funcionando.</p>",
    });
  });
