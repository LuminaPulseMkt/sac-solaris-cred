import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
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
import { SolarisLogo } from "@/components/solaris-logo";

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

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <SolarisLogo />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Visão geral</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{overview.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Alertas & relatórios</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{alertsReports.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Integração</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{integration.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
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
