// Fonte única de verdade para as permissões de operador: chaves usadas pelo
// middleware requirePermission, pela UI de gerenciamento em Integração, e
// pelo perfil (getMyProfile) que alimenta o menu lateral.

export type PermissionKey =
  | "dashboard"
  | "conversas"
  | "alertas"
  | "relatorios"
  | "campanhas"
  | "delete_conversations"
  | "view_ai_analysis"
  | "send_report_email";

export type OperatorPermissions = {
  can_view_dashboard: boolean;
  can_view_conversas: boolean;
  can_view_alertas: boolean;
  can_view_relatorios: boolean;
  can_view_campanhas: boolean;
  can_delete_conversations: boolean;
  can_view_ai_analysis: boolean;
  can_send_report_email: boolean;
};

// Espelha os defaults da coluna no banco (migração add_operator_permissions.sql).
// Usado quando um operador ainda não tem linha em operator_permissions.
export const PERMISSION_DEFAULTS: OperatorPermissions = {
  can_view_dashboard: true,
  can_view_conversas: true,
  can_view_alertas: true,
  can_view_relatorios: true,
  can_view_campanhas: false,
  can_delete_conversations: false,
  can_view_ai_analysis: true,
  can_send_report_email: false,
};

export const PERMISSION_COLUMN: Record<PermissionKey, keyof OperatorPermissions> = {
  dashboard: "can_view_dashboard",
  conversas: "can_view_conversas",
  alertas: "can_view_alertas",
  relatorios: "can_view_relatorios",
  campanhas: "can_view_campanhas",
  delete_conversations: "can_delete_conversations",
  view_ai_analysis: "can_view_ai_analysis",
  send_report_email: "can_send_report_email",
};

export const PAGE_PERMISSIONS: { key: PermissionKey; label: string; hint: string }[] = [
  { key: "dashboard", label: "Visão geral (Dashboard)", hint: "Aparece no menu lateral." },
  { key: "conversas", label: "Conversas", hint: "Aparece no menu lateral." },
  { key: "alertas", label: "Alertas", hint: "Aparece no menu lateral." },
  { key: "relatorios", label: "Relatórios", hint: "Aparece no menu lateral." },
  { key: "campanhas", label: "Campanhas", hint: "Aparece no menu lateral; mostra só os envios do próprio operador." },
];

export const ACTION_PERMISSIONS: { key: PermissionKey; label: string; hint: string }[] = [
  {
    key: "delete_conversations",
    label: "Excluir conversas",
    hint: "Permite apagar as próprias conversas em Conversas/Alertas.",
  },
  {
    key: "view_ai_analysis",
    label: "Ver análise de IA",
    hint: "Permite abrir a análise de IA de uma conversa própria.",
  },
  {
    key: "send_report_email",
    label: "Enviar relatório completo por e-mail",
    hint: "O relatório enviado é o consolidado (todos os operadores), igual ao de um admin.",
  },
];
