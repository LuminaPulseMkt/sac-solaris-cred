import type { Channel, Conversation, ConversationStatus, Message } from "@/types/sac";
import { calculateSacScore } from "@/lib/sac/score";
import { collaborators } from "./collaborators";

const customers = [
  "Marina Alves", "João Pereira", "Patrícia Lima", "Rafael Mendes",
  "Sofia Ribeiro", "Tiago Nunes", "Vanessa Dias", "Roberto Faria",
  "Camila Teixeira", "Lucas Andrade", "Beatriz Cardoso", "Marcelo Pires",
  "Juliana Castro", "Pedro Henrique", "Natália Moura", "André Barbosa",
];

const channels: Channel[] = ["whatsapp", "chat", "email"];
const statuses: ConversationStatus[] = ["resolved", "ongoing", "escalated", "resolved", "resolved"];

const seeds = [
  { rt: 95, st: "resolved", cv: true },
  { rt: 340, st: "resolved", cv: true },
  { rt: 720, st: "ongoing", cv: false },
  { rt: 180, st: "resolved", cv: true },
  { rt: 1200, st: "escalated", cv: false },
  { rt: 240, st: "resolved", cv: false },
  { rt: 60, st: "resolved", cv: true },
  { rt: 480, st: "ongoing", cv: false },
  { rt: 150, st: "resolved", cv: true },
  { rt: 900, st: "escalated", cv: false },
  { rt: 200, st: "resolved", cv: true },
  { rt: 320, st: "resolved", cv: true },
  { rt: 110, st: "resolved", cv: true },
  { rt: 600, st: "ongoing", cv: false },
  { rt: 80, st: "resolved", cv: true },
  { rt: 1500, st: "escalated", cv: false },
  { rt: 290, st: "resolved", cv: false },
  { rt: 145, st: "resolved", cv: true },
  { rt: 540, st: "ongoing", cv: false },
  { rt: 220, st: "resolved", cv: true },
  { rt: 175, st: "resolved", cv: true },
  { rt: 410, st: "resolved", cv: false },
  { rt: 65, st: "resolved", cv: true },
  { rt: 380, st: "resolved", cv: true },
];

function buildMessages(start: Date, count: number, rtSeconds: number): Message[] {
  const msgs: Message[] = [];
  let t = start.getTime();
  for (let i = 0; i < count; i++) {
    msgs.push({
      from: i % 2 === 0 ? "customer" : "collaborator",
      text: i % 2 === 0
        ? "Olá, preciso de ajuda com meu pedido."
        : "Claro! Me passe o número do pedido por favor.",
      timestamp: new Date(t).toISOString(),
    });
    t += rtSeconds * 1000;
  }
  return msgs;
}

const now = Date.now();

export const conversations: Conversation[] = seeds.map((s, i) => {
  const collab = collaborators[i % collaborators.length];
  const channel = channels[i % channels.length];
  const startedAt = new Date(now - (i + 1) * 1000 * 60 * 27);
  const endedAt = new Date(startedAt.getTime() + s.rt * 1000 * 4);
  const messages = buildMessages(startedAt, 6, Math.max(20, s.rt / 3));
  const status = s.st as ConversationStatus;
  const responseTimeSeconds = s.rt;
  const converted = s.cv;
  const { total } = calculateSacScore({ responseTimeSeconds, status, converted });
  return {
    id: `conv-${1000 + i}`,
    collaboratorId: collab.id,
    collaboratorName: collab.name,
    customerName: customers[i % customers.length],
    channel,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    messages,
    responseTimeSeconds,
    status,
    converted,
    score: total,
  };
});

// ensure statuses var is consumed
void statuses;
