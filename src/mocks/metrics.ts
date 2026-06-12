export const dashboardMetrics = [
  { label: "Conversas hoje", value: "—" },
  { label: "Tempo médio de resposta", value: "—" },
  { label: "Taxa de conversão", value: "—" },
  { label: "Score médio SAC", value: "—" },
];

export const responseTimeByHour: { hour: string; seconds: number; goal: number }[] = [];
export const collaboratorWeekly: { name: string; conversion: number; score: number }[] = [];
export const collaboratorHistory: { collaboratorId: string; weeks: { week: string; score: number }[] }[] = [];
