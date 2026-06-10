import { conversations } from "./conversations";
import { collaborators } from "./collaborators";

const todayCount = conversations.length;
const avgResp = conversations.reduce((a, c) => a + c.responseTimeSeconds, 0) / conversations.length;
const convRate = (conversations.filter((c) => c.converted).length / conversations.length) * 100;
const avgScore = conversations.reduce((a, c) => a + c.score, 0) / conversations.length;

export const dashboardMetrics = [
  {
    label: "Conversas hoje",
    value: String(todayCount),
    delta: 12.4,
    deltaLabel: "vs ontem",
  },
  {
    label: "Tempo médio de resposta",
    value: `${Math.round(avgResp / 60)}min ${Math.round(avgResp % 60)}s`,
    delta: 8.2,
    deltaLabel: "vs ontem",
    alert: avgResp / 60 > 3,
  },
  {
    label: "Taxa de conversão",
    value: `${convRate.toFixed(1)}%`,
    delta: 3.6,
    deltaLabel: "vs semana passada",
  },
  {
    label: "Score médio SAC",
    value: `${avgScore.toFixed(0)}/100`,
    delta: 2.1,
    deltaLabel: "vs semana passada",
  },
];

// Response time per hour (mocked curve)
export const responseTimeByHour = Array.from({ length: 12 }).map((_, i) => {
  const hour = 8 + i;
  const base = 90 + Math.sin(i / 2) * 50 + (i > 6 ? 60 : 0);
  return { hour: `${hour.toString().padStart(2, "0")}h`, seconds: Math.round(base), goal: 180 };
});

// Per-collaborator weekly performance
export const collaboratorWeekly = collaborators.map((c, i) => {
  const cs = conversations.filter((x) => x.collaboratorId === c.id);
  const conv = cs.length > 0 ? (cs.filter((x) => x.converted).length / cs.length) * 100 : 60 + i * 4;
  const sc = cs.length > 0 ? cs.reduce((a, x) => a + x.score, 0) / cs.length : 70 + i * 3;
  return { name: c.name.split(" ")[0], conversion: Math.round(conv), score: Math.round(sc) };
});

export const collaboratorHistory = collaborators.map((c) => ({
  collaboratorId: c.id,
  weeks: Array.from({ length: 8 }).map((_, w) => ({
    week: `S${w + 1}`,
    score: 60 + Math.round(Math.sin(w + c.id.length) * 10 + w * 2),
  })),
}));
