import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { OperatorAvatar } from "@/components/operator-avatar";
import { Tag } from "@/components/status-tag";
import { Button } from "@/components/ui/button";
import { Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listOperatorStats, deleteOperator } from "@/lib/operators.functions";
import { formatDuration, channelLabel } from "@/lib/sac/format";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/operadores")({
  head: () => ({
    meta: [
      { title: "Operadores — SAC" },
      { name: "description", content: "Desempenho individual, ranking e métricas de cada operador." },
    ],
  }),
  component: OperadoresPage,
});

function OperadoresPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOperatorStats);
  const deleteFn = useServerFn(deleteOperator);
  const { data: stats = [], isLoading } = useQuery({ queryKey: ["operator-stats"], queryFn: () => listFn(), refetchInterval: 30_000 });
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteFn({ data: { id: toDelete.id } });
      toast.success("Operador excluído");
      qc.invalidateQueries({ queryKey: ["operator-stats"] });
      qc.invalidateQueries({ queryKey: ["operators"] });
    } catch {
      toast.error("Erro ao excluir. Tente novamente.");
    } finally {
      setToDelete(null);
    }
  }

  return (
    <>
      <AppHeader title="Operadores" subtitle="Desempenho individual e ranking" />
      <main className="flex-1 space-y-6 p-4 md:p-6">
        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : stats.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhum operador cadastrado.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clique em <Link to="/integracao" className="text-brand hover:underline">+ Novo operador</Link> para começar.
            </p>
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stats.map((c) => (
              <article key={c.id} className="rounded-lg border border-border bg-card p-4">
                <header className="flex items-center gap-3">
                  <OperatorAvatar name={c.name} score={c.avgScore} size="lg" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold">{c.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {c.instance_name} · {channelLabel[c.channel] ?? c.channel}
                    </p>
                  </div>
                  <Tag tone={c.avgScore >= 80 ? "success" : c.avgScore >= 50 ? "warning" : "danger"}>
                    {c.avgScore}/100
                  </Tag>
                </header>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-surface p-2">
                    <dt className="text-[10px] uppercase text-muted-foreground">Conversas</dt>
                    <dd className="text-base font-medium tabular-nums">{c.total}</dd>
                  </div>
                  <div className="rounded bg-surface p-2">
                    <dt className="text-[10px] uppercase text-muted-foreground">Tempo médio</dt>
                    <dd className="text-base font-medium tabular-nums">{c.avgResp ? formatDuration(c.avgResp) : "—"}</dd>
                  </div>
                  <div className="rounded bg-surface p-2">
                    <dt className="text-[10px] uppercase text-muted-foreground">Conversão</dt>
                    <dd className="text-base font-medium tabular-nums">{c.convRate.toFixed(0)}%</dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    onClick={() => setToDelete({ id: c.id, name: c.name })}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </Button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o operador {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as conversas e mensagens vinculadas serão excluídas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-danger text-white hover:bg-danger/90"
            >
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
