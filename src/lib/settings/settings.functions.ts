import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SENSITIVE_KEYS = new Set(["openai_api_key", "evolution_api_key"]);

export type SettingsMap = Record<string, string>;

export type SafeSettings = {
  values: SettingsMap;
  sensitive: Record<string, { configured: boolean; lastFour: string | null }>;
};

export const getSettings = createServerFn({ method: "GET" }).handler(async (): Promise<SafeSettings> => {
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

export const saveSetting = createServerFn({ method: "POST" })
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

export const testEvolutionConnection = createServerFn({ method: "POST" }).handler(async () => {
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
    return { success: false, error: "URL ou API Key não configuradas", instances: [] as string[] };
  }
  try {
    const res = await fetch(`${url}/instance/fetchInstances`, {
      method: "GET",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}`, instances: [] };
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
    return { success: true, instances };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido", instances: [] };
  }
});

export const getActiveInstances = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("operators")
    .select("id, name, instance_name, channel")
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});
