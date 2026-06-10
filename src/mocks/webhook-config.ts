import type { SyncLog, WebhookConfig } from "@/types/sac";

export const webhookConfig: WebhookConfig = {
  url: "https://n8n.solaris.app/webhook/sac",
  connected: true,
  lastSyncAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  fieldMapping: {
    conversation_id: "id",
    "collaborator.id": "collaboratorId",
    "collaborator.name": "collaboratorName",
    "customer.name": "customerName",
    "customer.channel": "channel",
    started_at: "startedAt",
    ended_at: "endedAt",
    status: "status",
    converted: "converted",
    messages: "messages",
  },
};

const now = Date.now();
const ago = (m: number) => new Date(now - m * 60_000).toISOString();

export const syncLogs: SyncLog[] = [
  { id: "s1", syncedAt: ago(4), status: "success", recordsImported: 14 },
  { id: "s2", syncedAt: ago(34), status: "success", recordsImported: 22 },
  { id: "s3", syncedAt: ago(64), status: "error", recordsImported: 0, message: "Timeout no n8n" },
  { id: "s4", syncedAt: ago(124), status: "success", recordsImported: 18 },
  { id: "s5", syncedAt: ago(220), status: "success", recordsImported: 31 },
];
