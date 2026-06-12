export type OperatorVisualState = "pending" | "active" | "stale" | "error" | "inactive";

export function deriveOperatorState(opts: {
  status: string;
  last_received_at: string | null;
}): OperatorVisualState {
  if (opts.status === "inactive") return "inactive";
  if (opts.status === "error") return "error";
  if (!opts.last_received_at) return "pending";
  const ageMs = Date.now() - new Date(opts.last_received_at).getTime();
  const h = ageMs / 3_600_000;
  if (h <= 24) return "active";
  if (h >= 48) return "stale";
  return "active";
}

export const operatorStateMeta: Record<
  OperatorVisualState,
  { label: string; color: string; dot: string }
> = {
  pending: { label: "Aguardando", color: "text-warning", dot: "bg-warning" },
  active: { label: "Ativo", color: "text-success", dot: "bg-success animate-pulse" },
  stale: { label: "Sem dados 48h+", color: "text-warning", dot: "bg-warning" },
  error: { label: "Erro recente", color: "text-danger", dot: "bg-danger" },
  inactive: { label: "Inativo", color: "text-muted-foreground", dot: "bg-muted-foreground" },
};
