import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChannelBadge } from "@/components/channel-badge";
import { CollaboratorAvatar } from "@/components/collaborator-avatar";
import { ScoreBar } from "@/components/score-bar";
import { StatusTag } from "@/components/status-tag";
import { ConversationDetailDialog } from "@/components/conversation-detail-dialog";
import { conversations } from "@/mocks/conversations";
import { collaborators } from "@/mocks/collaborators";
import { useFiltersStore } from "@/stores/filters";
import { formatDuration } from "@/lib/sac/format";
import type { Conversation } from "@/types/sac";

export const Route = createFileRoute("/conversas")({
  head: () => ({
    meta: [
      { title: "Conversas — SAC" },
      { name: "description", content: "Lista completa de conversas auditadas com filtros, score e detalhes." },
      { property: "og:title", content: "Conversas — Solaris Analytics Chat" },
      { property: "og:description", content: "Audite cada conversa por canal, score e colaborador com detalhe completo." },
    ],
  }),
  component: ConversasPage,
});

const PAGE_SIZE = 10;

function ConversasPage() {
  const { channel, score, collaboratorId, search, setChannel, setScore, setCollaboratorId, setSearch, reset } = useFiltersStore();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Conversation | null>(null);

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (channel !== "all" && c.channel !== channel) return false;
      if (collaboratorId !== "all" && c.collaboratorId !== collaboratorId) return false;
      if (score === "high" && c.score < 80) return false;
      if (score === "medium" && (c.score < 50 || c.score >= 80)) return false;
      if (score === "low" && c.score >= 50) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.customerName.toLowerCase().includes(q) && !c.collaboratorName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [channel, score, collaboratorId, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <AppHeader title="Conversas" subtitle={`${filtered.length} conversas após filtros`} />
      <main className="flex-1 space-y-4 p-4 md:p-6">
        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <Input
            placeholder="Buscar cliente ou colaborador…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 w-56"
          />
          <Select value={channel} onValueChange={(v) => { setChannel(v as never); setPage(1); }}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="chat">Chat</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
            </SelectContent>
          </Select>
          <Select value={score} onValueChange={(v) => { setScore(v as never); setPage(1); }}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os scores</SelectItem>
              <SelectItem value="high">Alto (≥80)</SelectItem>
              <SelectItem value="medium">Médio (50–79)</SelectItem>
              <SelectItem value="low">Baixo (&lt;50)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={collaboratorId} onValueChange={(v) => { setCollaboratorId(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os colaboradores</SelectItem>
              {collaborators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => { reset(); setPage(1); }}>Limpar</Button>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Conversão</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CollaboratorAvatar name={c.collaboratorName} score={c.score} size="sm" />
                        <span className="text-sm">{c.collaboratorName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.customerName}</TableCell>
                    <TableCell><ChannelBadge channel={c.channel} /></TableCell>
                    <TableCell className="text-sm tabular-nums">{formatDuration(c.responseTimeSeconds)}</TableCell>
                    <TableCell><ScoreBar score={c.score} /></TableCell>
                    <TableCell><StatusTag status={c.status} /></TableCell>
                    <TableCell><StatusTag status={c.status} converted={c.converted} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(c)}>Detalhes</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {pageItems.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        </section>
      </main>

      <ConversationDetailDialog conversation={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
