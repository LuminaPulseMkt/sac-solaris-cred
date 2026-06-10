import { Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function SolarisLogo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-brand-foreground">
        <Sun className="h-4.5 w-4.5" strokeWidth={2.25} />
      </span>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Solaris Analytics</span>
          <span className="text-[11px] text-muted-foreground">Chat</span>
        </div>
      )}
      <span className="ml-1 inline-flex items-center rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-strong">
        SAC
      </span>
    </div>
  );
}
