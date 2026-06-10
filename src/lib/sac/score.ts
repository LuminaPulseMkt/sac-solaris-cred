import type { Conversation } from "@/types/sac";

export function timeScore(seconds: number): number {
  const minutes = seconds / 60;
  if (minutes <= 2) return 100;
  if (minutes <= 5) return 70;
  if (minutes <= 10) return 40;
  return 10;
}

export function resolutionScore(status: Conversation["status"]): number {
  if (status === "resolved") return 100;
  if (status === "ongoing") return 60;
  return 20;
}

export function conversionScore(converted: boolean): number {
  return converted ? 100 : 30;
}

export function calculateSacScore(c: Pick<Conversation, "responseTimeSeconds" | "status" | "converted">) {
  const t = timeScore(c.responseTimeSeconds);
  const r = resolutionScore(c.status);
  const cv = conversionScore(c.converted);
  const total = 0.4 * t + 0.35 * r + 0.25 * cv;
  return {
    total: Math.round(total),
    breakdown: { time: t, resolution: r, conversion: cv },
  };
}

export function scoreColor(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}
