// Server-side Supabase client. Requires the service role key so privileged
// server functions never silently fall back to anon/public permissions.
// Use this for server functions and server routes only.
// For user-authenticated queries (with RLS), use the auth middleware instead.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

function envKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!url || !key) {
    const missing = [
      ...(!url ? ['SUPABASE_URL'] : []),
      ...(!key ? ['SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Check the Supabase project connection.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }
  return `${url}::${key}`;
}

function createSupabaseAdminClient(schema: string = 'public') {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY)!;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[Supabase] SUPABASE_SERVICE_ROLE_KEY missing; falling back to publishable key (RLS enforced).');
  }
  return createClient<Database>(SUPABASE_URL, key, {
    db: { schema: schema as 'public' },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// Cache clients per (env, schema) so we don't rebuild on every call.
const cache = new Map<string, SupabaseClient<Database>>();

function getClientCached(schema: string): SupabaseClient<Database> {
  const cacheKey = `${envKey()}::${schema}`;
  let client = cache.get(cacheKey);
  if (!client) {
    client = createSupabaseAdminClient(schema);
    cache.set(cacheKey, client);
  }
  return client;
}

// Default admin client — targets public schema (empresa atual).
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop, receiver) {
    return Reflect.get(getClientCached('public'), prop, receiver);
  },
});

/**
 * Admin client apontando para um schema específico de um tenant.
 * Use apenas em contexto server-side. Nunca exponha ao browser.
 */
export function getSchemaClient(schemaName: string): SupabaseClient<Database> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`schema_name inválido: ${schemaName}`);
  }
  return getClientCached(schemaName);
}

/**
 * Resolve qual client usar dado um `schemaName` opcional.
 * Se vazio ou 'public', retorna o admin padrão.
 */
export function getDbForSchema(schemaName?: string | null): SupabaseClient<Database> {
  if (!schemaName || schemaName === 'public') return getClientCached('public');
  return getSchemaClient(schemaName);
}

/**
 * Descobre em qual schema/tenant o token do webhook pertence.
 * Procura primeiro em `public`; se não encontrar, percorre todos os tenants
 * registrados em `public.tenants` (exceto public).
 */
export async function getClientForToken(
  token: string,
): Promise<{ client: SupabaseClient<Database>; schemaName: string } | null> {
  const publicClient = getClientCached('public');
  const { data: op } = await publicClient
    .from('operators')
    .select('id')
    .eq('token', token)
    .maybeSingle();
  if (op) return { client: publicClient, schemaName: 'public' };

  const { data: tenants } = await publicClient
    .from('tenants' as never)
    .select('schema_name')
    .neq('schema_name', 'public');

  for (const t of (tenants as { schema_name: string }[] | null) ?? []) {
    try {
      const client = getSchemaClient(t.schema_name);
      const { data } = await client
        .from('operators')
        .select('id')
        .eq('token', token)
        .maybeSingle();
      if (data) return { client, schemaName: t.schema_name };
    } catch {
      continue;
    }
  }
  return null;
}
