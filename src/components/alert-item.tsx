import { AlertTriangle, Info, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alert } from "@/types/sac";
import { formatDateTime } from "@/lib/sac/format";

export function AlertItem({ alert }: { alert: Alert }) {
  const Icon = alert.severity === "high" ? AlertCircle : alert.severity === "medium" ? AlertTriangle : Info;
  const bg =
    alert.severity === "high"
      ? "bg-danger-soft text-danger"
      : alert.severity === "medium"
        ? "bg-warning-soft text-[color:var(--warning)]"
        : "bg-success-soft text-success";

  return (
    <div className={cn("flex items-start gap-3 rounded-md p-3", bg)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{alert.title}</p>
        <p className="text-xs text-muted-foreground">{alert.description}</p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{formatDateTime(alert.createdAt)}</p>
      </div>
    </div>
  );
}
