import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Megaphone, Pencil, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { listCampaigns, getCampaignDetail, renameCampaign, deleteCampaign } from "@/lib/campaigns/campaigns.functions";
import { formatDateTime } from "@/lib/sac/format";

export const Route = createFileRoute("/_authenticated/campanhas")({
  head: () => ({
    meta: [
      { title: "Campanhas — SAC" },
      { name: "description", content: "Disparos de campanha via n8n e taxa de resposta." },
    ],
  }),
  component: CampanhasPage,
});

type Campaign = Awaited<ReturnType<typeof listCampaigns>>[number];

function CampanhasPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaigns);
  const renameFn = useServerFn(renameCampaign);
  const deleteFn = useServerFn(deleteCampaign);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });

  const [detailFor, setDetailFor] = useState<Campaign | null>(null);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [editName, setEditName] = useState("");
  const [toDelete, setToDelete] = useState<Campaign | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["campaigns"] });
  }

  async function handleRename() {
    if (!editing) return;
    const name = editName.trim();
    if (!name) return toast.error("Informe um nome");
    try {
      await renameFn({ data: { id: editing.id, name } });
      toast.success("Campanha renomeada");
      setEditing(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao renomear");
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await deleteFn({ data: { id: toDelete.id } });
      toast.success("Campanha excluída");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setToDelete(null);
    }
  }

  const totalSent = campaigns.reduce((a, c) => a + c.sent, 0);
  const totalReplied = campaigns.reduce((a, c) => a + c.replied, 0);
  const overallRate = totalSent ? Math.round((totalReplied / totalSent) * 1000) / 10 : 0;

  return (
    <>
      <AppHeader
        title="Campanhas"
        subtitle={`${campaigns.length} campanha(s) · ${totalSent} envio(s) · ${overallRate}% de resposta geral`}
      />
      <main className="flex-1 space-y-4 p-4 md:p-6">
        <section className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <p>
            As campanhas são registradas automaticamente quando o n8n dispara uma mensagem chamando
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              POST /api/public/campaign/send/&#123;token do operador&#125;
            </code>
            com <code className="font-mono text-xs">campaign_name</code> e <code className="font-mono text-xs">lead_phone</code>.
            A resposta é casada automaticamente quando o lead responde pelo WhatsApp.
          </p>
        </section>

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <Megaphone className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhuma campanha registrada ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Assim que o n8n disparar a primeira mensagem de campanha, ela aparece aqui.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Enviadas</TableHead>
                  <TableHead className="text-right">Respondidas</TableHead>
                  <TableHead className="text-right">Conversão</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.sent}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.replied}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="secondary"
                        className={
                          c.conversionRate >= 30
                            ? "bg-success/15 text-success"
                            : c.conversionRate >= 10
                              ? "bg-warning/15 text-warning"
                              : "bg-danger/15 text-danger"
                        }
                      >
                        {c.conversionRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Ver detalhes" onClick={() => setDetailFor(c)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Renomear"
                          onClick={() => { setEditing(c); setEditName(c.name); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Excluir"
                          className="text-danger hover:bg-danger/10 hover:text-danger"
                          onClick={() => setToDelete(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <CampaignDetailDialog campaign={detailFor} onClose={() => setDetailFor(null)} />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Renomear campanha</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Button className="w-full" onClick={handleRename}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a campanha {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os {toDelete?.sent ?? 0} envio(s) registrado(s) para essa campanha serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-danger text-white hover:bg-danger/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CampaignDetailDialog({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  const detailFn = useServerFn(getCampaignDetail);
  const { data } = useQuery({
    queryKey: ["campaign-detail", campaign?.id],
    queryFn: () => detailFn({ data: { campaign_id: campaign!.id } }),
    enabled: !!campaign,
  });

  return (
    <Dialog open={!!campaign} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{campaign?.name}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Operador</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead>Respondeu?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.sends ?? []).map((s) => {
                const op = s.operators as { name?: string; instance_name?: string } | null;
                return (
                  <TableRow key={s.id}>
                    <TableCell>{s.lead_name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{s.lead_phone}</TableCell>
                    <TableCell className="text-xs">{op?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(s.sent_at)}</TableCell>
                    <TableCell>
                      {s.replied ? (
                        <Badge className="bg-success/15 text-success">Sim{s.replied_at ? ` · ${formatDateTime(s.replied_at)}` : ""}</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">Não</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {(data?.sends ?? []).length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum envio registrado.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
