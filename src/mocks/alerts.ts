import type { Alert } from "@/types/sac";

const now = Date.now();
const ago = (m: number) => new Date(now - m * 60_000).toISOString();

export const alerts: Alert[] = [
  { id: "a1", severity: "high", title: "Diego Lopes sem resposta há 12 min", description: "Conversa com Rafael Mendes (e-mail) acima do SLA.", createdAt: ago(4), collaboratorId: "c4" },
  { id: "a2", severity: "high", title: "Score abaixo do mínimo", description: "Bruno Silva — score 42 na conversa #1004.", createdAt: ago(11), collaboratorId: "c2" },
  { id: "a3", severity: "medium", title: "Pico de volume na fila", description: "Canal WhatsApp com 14 conversas em espera.", createdAt: ago(18) },
  { id: "a4", severity: "medium", title: "SLA quase estourado", description: "Felipe Rocha — 2 conversas próximas do limite.", createdAt: ago(25), collaboratorId: "c6" },
  { id: "a5", severity: "info", title: "Meta diária atingida", description: "Equipe alcançou 95% de conversão hoje.", createdAt: ago(60) },
  { id: "a6", severity: "info", title: "Ana Martins — score 96", description: "Excelente desempenho na conversa #1014.", createdAt: ago(90), collaboratorId: "c1" },
];
