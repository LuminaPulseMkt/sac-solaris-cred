import { cn } from "@/lib/utils";
import { scoreColor } from "@/lib/sac/score";

export function ScoreBar({ score, className }: { score: number; className?: string }) {
  const color = scoreColor(score);
  const bg = color === "success" ? "bg-success" : color === "warning" ? "bg-warning" : "bg-danger";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", bg)} style={{ width: `${Math.max(4, score)}%` }} />
      </div>
      <span className="w-7 text-right text-xs font-medium tabular-nums">{score}</span>
    </div>
  );
}
