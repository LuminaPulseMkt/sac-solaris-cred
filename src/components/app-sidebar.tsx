import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  Timer,
  TrendingUp,
  BellRing,
  FileBarChart,
  Gauge,
  Webhook,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SolarisLogo } from "@/components/solaris-logo";
import { alerts } from "@/mocks/alerts";

const overview = [
  { title: "Visão geral", url: "/dashboard", icon: LayoutDashboard },
  { title: "Conversas", url: "/conversas", icon: MessagesSquare },
  { title: "Colaboradores", url: "/colaboradores", icon: Users },
  { title: "Tempo de resposta", url: "/dashboard#tempo", icon: Timer },
  { title: "Conversão", url: "/dashboard#conversao", icon: TrendingUp },
];

const alertsReports = [
  { title: "Alertas", url: "/alertas", icon: BellRing, badge: "danger" as const },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart },
  { title: "Scoring", url: "/configuracoes#scoring", icon: Gauge },
];

const integration = [
  { title: "n8n / webhook", url: "/integracao", icon: Webhook, badge: "success" as const },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => path === url.split("#")[0];

  const highAlerts = alerts.filter((a) => a.severity === "high").length;

  const renderItem = (it: { title: string; url: string; icon: typeof LayoutDashboard; badge?: "danger" | "success" }) => (
    <SidebarMenuItem key={it.title}>
      <SidebarMenuButton
        asChild
        isActive={isActive(it.url)}
        className="data-[active=true]:bg-brand-soft data-[active=true]:text-brand-strong data-[active=true]:font-medium"
      >
        <Link to={it.url} className="flex w-full items-center gap-2">
          <it.icon className="h-4 w-4" />
          <span className="flex-1 truncate">{it.title}</span>
          {it.badge === "danger" && highAlerts > 0 && (
            <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {highAlerts}
            </span>
          )}
          {it.badge === "success" && (
            <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">
              On
            </span>
          )}
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
    </Sidebar>
  );
}
