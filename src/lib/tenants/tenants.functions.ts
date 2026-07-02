import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readSuperAdminEmails(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "super_admin_emails")
    .maybeSingle();
  try {
    const parsed = JSON.parse(data?.value ?? "[]");
    return Array.isArray(parsed) ? parsed.map((s) => String(s).toLowerCase()) : [];
  } catch {
    return [];
  }
}

function emailFromClaims(claims: Record<string, unknown> | null | undefined): string | null {
  if (!claims) return null;
  const raw = (claims.email as string | undefined) ?? null;
  return raw ? raw.toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Super admin check
// ---------------------------------------------------------------------------

export const isSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = emailFromClaims(context.claims as never);
    if (!email) return { isSuperAdmin: false, email: null };
    const allowed = await readSuperAdminEmails();
    return { isSuperAdmin: allowed.includes(email), email };
  });

// ---------------------------------------------------------------------------
// Tenants do usuário logado
// ---------------------------------------------------------------------------

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  logo_url: string | null;
  plan: string | null;
  active: boolean;
  role?: string;
};

export const getMyTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Tenant[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tenant_users" as never)
      .select("role, tenants:tenant_id ( id, name, slug, schema_name, logo_url, plan, active )")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ role: string; tenants: Tenant | null }>;
    const own = rows
      .filter((r) => r.tenants)
      .map((r) => ({ ...(r.tenants as Tenant), role: r.role }));

    // Se super admin, devolve todos os tenants ativos como fallback.
    if (own.length === 0) {
      const email = emailFromClaims(context.claims as never);
      const allowed = await readSuperAdminEmails();
      if (email && allowed.includes(email)) {
        const { data: all } = await supabaseAdmin
          .from("tenants" as never)
          .select("id, name, slug, schema_name, logo_url, plan, active")
          .eq("active", true)
          .order("name");
        return ((all as Tenant[] | null) ?? []).map((t) => ({ ...t, role: "admin" }));
      }
    }
    return own;
  });

// ---------------------------------------------------------------------------
// Lista global — só super admin
// ---------------------------------------------------------------------------

export const listTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Tenant[]> => {
    const email = emailFromClaims(context.claims as never);
    const allowed = await readSuperAdminEmails();
    if (!email || !allowed.includes(email)) {
      throw new Error("Forbidden: requer super admin");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tenants" as never)
      .select("id, name, slug, schema_name, logo_url, plan, active, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Tenant[] | null) ?? [];
  });

// ---------------------------------------------------------------------------
// Criar novo tenant (schema Postgres novo + usuário admin)
// ---------------------------------------------------------------------------

const createTenantSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Use apenas minúsculas, números e hífen"),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createTenantSchema.parse(input))
  .handler(async ({ data, context }) => {
    const email = emailFromClaims(context.claims as never);
    const allowed = await readSuperAdminEmails();
    if (!email || !allowed.includes(email)) {
      throw new Error("Forbidden: requer super admin");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const schemaName = data.slug.replace(/-/g, "_");

    // 1. Provisiona o schema completo
    const { error: rpcErr } = await supabaseAdmin.rpc(
      "create_tenant_schema" as never,
      { schema_name: schemaName } as never,
    );
    if (rpcErr) throw new Error(`RPC create_tenant_schema falhou: ${rpcErr.message}`);

    // 2. Registra o tenant
    const { data: tenant, error: insErr } = await supabaseAdmin
      .from("tenants" as never)
      .insert({ name: data.name, slug: data.slug, schema_name: schemaName } as never)
      .select("id, name, slug, schema_name")
      .single();
    if (insErr || !tenant) throw new Error(`Falha ao registrar tenant: ${insErr?.message}`);

    // 3. Cria user admin
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.adminEmail,
      password: data.adminPassword,
      email_confirm: true,
    });
    if (authErr || !authUser?.user) {
      throw new Error(`Falha ao criar usuário admin: ${authErr?.message ?? "unknown"}`);
    }

    // 4. Vincula user ao tenant
    const { error: tuErr } = await supabaseAdmin
      .from("tenant_users" as never)
      .insert({
        tenant_id: (tenant as { id: string }).id,
        user_id: authUser.user.id,
        role: "admin",
      } as never);
    if (tuErr) throw new Error(`Falha ao vincular user ao tenant: ${tuErr.message}`);

    return { tenant, userId: authUser.user.id };
  });
