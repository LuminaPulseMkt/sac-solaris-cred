import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  BellRing,
  FileBarChart,
  Gauge,
  Webhook,
  Settings,
  LogOut,
  Building2,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SolarisLogo } from "@/components/solaris-logo";
import { useTenant } from "@/contexts/tenant-context";
import { useProfile } from "@/contexts/profile-context";
import { isSuperAdmin } from "@/lib/tenants/tenants.functions";

const overview = [
  { title: "Visão geral", url: "/dashboard", icon: LayoutDashboard },
  { title: "Conversas", url: "/conversas", icon: MessagesSquare },
  { title: "Operadores", url: "/operadores", icon: Users },
];

const alertsReports = [
  { title: "Alertas", url: "/alertas", icon: BellRing },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart },
  { title: "Scoring", url: "/configuracoes#scoring", icon: Gauge },
];

const integration = [
  { title: "Integração / Webhook", url: "/integracao", icon: Webhook },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isActive = (url: string) => path === url.split("#")[0];
  const { tenants, activeTenant, setActiveTenantId } = useTenant();
  const profile = useProfile();
  const isOperator = profile?.role === "operator";
  const checkSuperAdmin = useServerFn(isSuperAdmin);
  const { data: superAdmin } = useQuery({
    queryKey: ["is-super-admin"],
    queryFn: () => checkSuperAdmin(),
    staleTime: 5 * 60_000,
    enabled: !isOperator,
  });

  const handleLogout = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const renderItem = (it: { title: string; url: string; icon: typeof LayoutDashboard }) => (
    <SidebarMenuItem key={it.title}>
      <SidebarMenuButton
        asChild
        isActive={isActive(it.url)}
        className="data-[active=true]:bg-brand-soft data-[active=true]:text-brand-strong data-[active=true]:font-medium"
      >
        <Link to={it.url} className="flex w-full items-center gap-2">
          <it.icon className="h-4 w-4" />
          <span className="flex-1 truncate">{it.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const adminItem = { title: "Empresas", url: "/admin", icon: Building2 };

  const visibleOverview = isOperator
    ? overview.filter((i) => ["/dashboard", "/conversas"].includes(i.url))
    : overview;
  const visibleAlertsReports = isOperator
    ? alertsReports.filter((i) => ["/alertas", "/relatorios"].includes(i.url))
    : alertsReports;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4 space-y-3">
        <SolarisLogo />
        {!isOperator && tenants.length > 1 && activeTenant && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-xs h-8"
              >
                <span className="truncate">{activeTenant.name}</span>
                <Building2 className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {tenants.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => setActiveTenantId(t.id)}
                  className="flex items-center justify-between"
                >
                  <span className="truncate">{t.name}</span>
                  {t.id === activeTenant.id && <Check className="h-3 w-3" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Visão geral</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{visibleOverview.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Alertas & relatórios</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{visibleAlertsReports.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {!isOperator && (
          <SidebarGroup>
            <SidebarGroupLabel>Integração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{integration.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {!isOperator && superAdmin?.isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItem(adminItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        {isOperator && profile?.operator && (
          <div className="px-3 py-2 text-xs border-t border-border">
            <p className="font-medium text-foreground truncate">{profile.operator.name}</p>
            <p className="text-muted-foreground truncate font-mono">{profile.operator.instance_name}</p>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
