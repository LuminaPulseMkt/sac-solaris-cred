import { cn } from "@/lib/utils";
import { initials } from "@/lib/sac/format";

const colors = ["bg-brand", "bg-success", "bg-info", "bg-warning", "bg-danger", "bg-chart-5"];

export function CollaboratorAvatar({ name, score, size = "md" }: { name: string; score?: number; size?: "sm" | "md" | "lg" }) {
  const i = name.length % colors.length;
  const color = score !== undefined
    ? score >= 80 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-danger"
    : colors[i];
  const dims = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-xs";
  return (
    <div className={cn("grid place-items-center rounded-full font-semibold text-white", color, dims)}>
      {initials(name)}
    </div>
  );
}
