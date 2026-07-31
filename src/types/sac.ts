export type Channel = "whatsapp" | "chat" | "email";
export type ConversationStatus = "resolved" | "ongoing" | "escalated" | "expired";
export type AlertSeverity = "high" | "medium" | "info";

export interface Message {
  from: "collaborator" | "customer";
  text: string;
  timestamp: string;
}

export interface Collaborator {
  id: string;
  name: string;
  role: string;
  mainChannel: Channel;
  avatarColor?: string;
}

export interface Conversation {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  customerName: string;
  channel: Channel;
  startedAt: string;
  endedAt: string;
  messages: Message[];
  responseTimeSeconds: number;
  status: ConversationStatus;
  converted: boolean;
  score: number;
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  createdAt: string;
  collaboratorId?: string;
}

export interface Metric {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  alert?: boolean;
}

export interface WebhookConfig {
  url: string;
  connected: boolean;
  lastSyncAt?: string;
  fieldMapping: Record<string, string>;
}

export interface SyncLog {
  id: string;
  syncedAt: string;
  status: "success" | "error";
  recordsImported: number;
  message?: string;
}

export interface AlertRule {
  noResponseMinutes: number;
  minScore: number;
  queuePeakThreshold: number;
  notifyEmail: boolean;
  notifyWebhook: boolean;
}

export interface SlaTargets {
  whatsapp: number;
  chat: number;
  email: number;
}
