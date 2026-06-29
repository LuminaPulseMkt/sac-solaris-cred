import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  alert?: boolean;
  icon?: React.ReactNode;
  hint?: string;
}

export function MetricCard({ label, value, delta, deltaLabel, alert, icon, hint }: MetricCardProps) {
  const positive = delta !== undefined && delta >= 0;
  return (
    <div className="rounded-lg bg-surface p-4">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {alert && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
      </div>
      <div className="mt-2 text-[22px] font-medium leading-tight text-foreground">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      {delta !== undefined && (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-xs",
            positive ? "text-success" : "text-danger",
          )}
        >
          {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          <span>{positive ? "+" : ""}{delta.toFixed(1)}%</span>
          {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}
