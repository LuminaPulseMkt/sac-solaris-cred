import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyTenants, type Tenant } from "@/lib/tenants/tenants.functions";
import { useHasSession } from "@/hooks/use-has-session";

const STORAGE_KEY = "sac.activeTenantId";

type TenantCtx = {
  tenants: Tenant[];
  activeTenant: Tenant | null;
  schemaName: string;
  setActiveTenantId: (id: string) => void;
  isLoading: boolean;
};

const TenantContext = createContext<TenantCtx | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const fetchTenants = useServerFn(getMyTenants);
  const queryClient = useQueryClient();
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  const hasSession = useHasSession();
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => fetchTenants(),
    staleTime: 60_000,
    enabled: hasSession,
    retry: false,
  });

  // Escolhe tenant padrão quando lista chega
  useEffect(() => {
    if (!tenants.length) return;
    if (activeId && tenants.some((t) => t.id === activeId)) return;
    const first = tenants[0];
    setActiveIdState(first.id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, first.id);
    }
  }, [tenants, activeId]);

  const setActiveTenantId = (id: string) => {
    setActiveIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    // Recarrega tudo já que o schema mudou
    queryClient.invalidateQueries();
  };

  const activeTenant = useMemo(
    () => tenants.find((t) => t.id === activeId) ?? tenants[0] ?? null,
    [tenants, activeId],
  );

  const value: TenantCtx = {
    tenants,
    activeTenant,
    schemaName: activeTenant?.schema_name ?? "public",
    setActiveTenantId,
    isLoading,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantCtx {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    // Fallback seguro fora do provider (SSR / testes).
    return {
      tenants: [],
      activeTenant: null,
      schemaName: "public",
      setActiveTenantId: () => {},
      isLoading: false,
    };
  }
  return ctx;
}

export function useTenantSchema(): string {
  return useTenant().schemaName;
}
