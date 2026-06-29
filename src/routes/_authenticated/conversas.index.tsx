import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OperatorAvatar } from "@/components/operator-avatar";
import { ScoreBar } from "@/components/score-bar";
import { MessagesSquare, Trash2 } from "lucide-react";
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
import { listConversations, deleteConversation, deleteConversations } from "@/lib/operators.functions";
import { formatDuration, formatDateTime } from "@/lib/sac/format";

export const Route = createFileRoute("/_authenticated/conversas/")({
  head: () => ({
    meta: [
      { title: "Conversas — SAC" },
      { name: "description", content: "Conversas auditadas em tempo real com filtros e exclusão." },
    ],
  }),
  component: ConversasPage,
});

const PAGE_SIZE = 20;

type Conv = Awaited<ReturnType<typeof listConversations>>[number];

function ConversasPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversations);
  const deleteOneFn = useServerFn(deleteConversation);
  const deleteManyFn = useServerFn(deleteConversations);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("conversations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          qc.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDeleteOne, setToDeleteOne] = useState<Conv | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      const op = (c.operators as { name?: string } | null)?.name?.toLowerCase() ?? "";
      return (c.lead_name ?? "").toLowerCase().includes(q) ||
        c.lead_phone.toLowerCase().includes(q) ||
        op.includes(q);
    });
  }, [rows, search]);

  const recurringPhones = useMemo(() => {
    const count: Record<string, number> = {};
    rows.forEach((c) => { count[c.lead_phone] = (count[c.lead_phone] ?? 0) + 1; });
    return new Set(Object.entries(count).filter(([, n]) => n > 1).map(([p]) => p));
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      pageItems.forEach((c) => (checked ? next.add(c.id) : next.delete(c.id)));
      return next;
    });
  }

  async function confirmDeleteOne() {
    if (!toDeleteOne) return;
    try {
      await deleteOneFn({ data: { id: toDeleteOne.id } });
      toast.success("Conversa excluída");
      setSelected((p) => {
        const n = new Set(p); n.delete(toDeleteOne.id); return n;
      });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      toast.error("Erro ao excluir. Tente novamente.");
    } finally {
      setToDeleteOne(null);
    }
  }

  async function confirmBulkDelete() {
    const ids = Array.from(selected);
    try {
      await deleteManyFn({ data: { ids } });
      toast.success(`${ids.length} conversas excluídas`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      toast.error("Erro ao excluir. Tente novamente.");
    } finally {
      setBulkOpen(false);
    }
  }

  const allPageSelected = pageItems.length > 0 && pageItems.every((c) => selected.has(c.id));

  return (
    <>
      <AppHeader title="Conversas" subtitle={`${filtered.length} conversas`} />
      <main className="flex-1 space-y-4 p-4 md:p-6">
        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <Input
            placeholder="Buscar lead, telefone ou operador…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 w-72"
          />
        </section>

        {selected.size > 0 && (
          <section className="flex items-center justify-between rounded-lg border border-danger/40 bg-danger/5 px-4 py-2">
            <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Cancelar</Button>
              <Button size="sm" className="bg-danger text-white hover:bg-danger/90" onClick={() => setBulkOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir selecionadas ({selected.size})
              </Button>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={(v) => toggleAllOnPage(!!v)}
                      aria-label="Selecionar tudo"
                    />
                  </TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Iniciada</TableHead>
                  <TableHead>Tempo médio</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
                )}
                {!isLoading && pageItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <MessagesSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Nenhuma conversa registrada ainda.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Configure o webhook para começar a receber dados.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
                {pageItems.map((c) => {
                  const opName = (c.operators as { name?: string } | null)?.name ?? "—";
                  return (
                    <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={() => toggle(c.id)}
                          aria-label="Selecionar"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <OperatorAvatar name={opName} size="sm" />
                          <span className="text-sm">{opName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.lead_name ?? "—"}
                        {recurringPhones.has(c.lead_phone) && (
                          <span className="ml-1.5 inline-block rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                            Recorrente
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.lead_phone}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(c.started_at)}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {c.avg_response_time_s ? formatDuration(c.avg_response_time_s) : "—"}
                      </TableCell>
                      <TableCell><ScoreBar score={c.score_sac ?? 0} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" asChild>
                            <Link to="/conversas/$id" params={{ id: c.id }}>Detalhes</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Excluir"
                            className="text-danger hover:bg-danger/10 hover:text-danger"
                            onClick={() => setToDeleteOne(c)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>Página {page} de {totalPages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </section>
      </main>

      <AlertDialog open={!!toDeleteOne} onOpenChange={(o) => !o && setToDeleteOne(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conversa com {toDeleteOne?.lead_name ?? "lead"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens serão apagadas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteOne} className="bg-danger text-white hover:bg-danger/90">
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selected.size} conversas?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-danger text-white hover:bg-danger/90">
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
