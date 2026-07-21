import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getEvolutionConfig() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["evolution_api_url", "evolution_api_key"]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value ?? "";

  const url = (map.evolution_api_url ?? "").replace(/\/+$/, "");
  const apiKey = map.evolution_api_key ?? "";

  if (!url || !apiKey) throw new Error("Evolution API não configurada");
  return { url, apiKey };
}

async function resolveInstanceName(userId: string, instanceName?: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: op } = await supabaseAdmin
    .from("operators")
    .select("instance_name")
    .eq("user_id", userId)
    .maybeSingle();

  // Operador: sempre a instância vinculada (ignora parâmetro)
  if (op?.instance_name) return op.instance_name;

  if (instanceName) return instanceName;

  throw new Error("Instância não encontrada");
}

export const getInstanceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ instance_name: z.string().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId?: string }).userId!;
    const { url, apiKey } = await getEvolutionConfig();
    const instance = await resolveInstanceName(userId, data.instance_name);

    const res = await fetch(`${url}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
    });

    if (!res.ok) {
      return { instance, state: "unknown", connected: false };
    }

    const json = (await res.json()) as Record<string, unknown>;
    const state = (((json?.instance as Record<string, unknown>)?.state ?? json?.state ?? "unknown") as string);

    return { instance, state, connected: state === "open" };
  });

export const getInstanceQrCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ instance_name: z.string().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId?: string }).userId!;
    const { url, apiKey } = await getEvolutionConfig();
    const instance = await resolveInstanceName(userId, data.instance_name);

    const res = await fetch(`${url}/instance/connect/${instance}`, {
      method: "GET",
      headers: { apikey: apiKey },
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Erro ao gerar QR code: ${res.status} — ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as Record<string, any>;
    const base64 = (json?.base64 ?? json?.qrcode?.base64 ?? null) as string | null;
    const code = (json?.code ?? json?.qrcode?.code ?? null) as string | null;

    return { instance, base64, code };
  });

export const logoutInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ instance_name: z.string().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId?: string }).userId!;
    const { url, apiKey } = await getEvolutionConfig();
    const instance = await resolveInstanceName(userId, data.instance_name);

    await fetch(`${url}/instance/logout/${instance}`, {
      method: "DELETE",
      headers: { apikey: apiKey },
    });

    return { ok: true, instance };
  });

export const restartInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ instance_name: z.string().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId?: string }).userId!;
    const { url, apiKey } = await getEvolutionConfig();
    const instance = await resolveInstanceName(userId, data.instance_name);

    await fetch(`${url}/instance/restart/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey },
    });

    return { ok: true, instance };
  });
