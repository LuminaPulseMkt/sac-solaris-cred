import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/sac/format";

type Tone = "success" | "warning" | "danger" | "info" | "muted";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-[color:var(--warning)]",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  muted: "bg-muted text-muted-foreground",
};

export function Tag({ tone = "muted", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusTag({ status, converted }: { status: "resolved" | "ongoing" | "escalated"; converted?: boolean }) {
  if (converted !== undefined) {
    if (converted) return <Tag tone="success">Converteu</Tag>;
    return <Tag tone="danger">Não converteu</Tag>;
  }
  const tone: Tone = status === "resolved" ? "success" : status === "ongoing" ? "warning" : "danger";
  return <Tag tone={tone}>{statusLabel[status]}</Tag>;
}
