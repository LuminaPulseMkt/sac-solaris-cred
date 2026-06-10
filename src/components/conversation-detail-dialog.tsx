import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChannelBadge } from "@/components/channel-badge";
import { CollaboratorAvatar } from "@/components/collaborator-avatar";
import { ScoreBar } from "@/components/score-bar";
import { StatusTag } from "@/components/status-tag";
import type { Conversation } from "@/types/sac";
import { calculateSacScore } from "@/lib/sac/score";
import { formatDuration, formatTime } from "@/lib/sac/format";
import { Sparkles } from "lucide-react";

interface Props {
  conversation: Conversation | null;
  onOpenChange: (v: boolean) => void;
}

const suggestions = [
  "Reduzir tempo de primeira resposta com saudação automatizada.",
  "Confirmar nome do cliente antes de pedir dados sensíveis.",
  "Encerrar com pergunta de satisfação para captar feedback.",
];

export function ConversationDetailDialog({ conversation, onOpenChange }: Props) {
  if (!conversation) return null;
  const breakdown = calculateSacScore(conversation).breakdown;

  return (
    <Dialog open={!!conversation} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <CollaboratorAvatar name={conversation.collaboratorName} score={conversation.score} />
            <div className="flex flex-col">
              <span>Conversa {conversation.id}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {conversation.collaboratorName} · {conversation.customerName}
              </span>
            </div>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 pt-2">
            <ChannelBadge channel={conversation.channel} />
            <StatusTag status={conversation.status} />
            <StatusTag status={conversation.status} converted={conversation.converted} />
            <span className="text-xs text-muted-foreground">Tempo médio: {formatDuration(conversation.responseTimeSeconds)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcrição</h3>
            <div className="max-h-72 space-y-3 overflow-auto rounded-md border border-border bg-surface p-3">
              {conversation.messages.map((m, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${m.from === "collaborator" ? "bg-brand" : "bg-info"}`} />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                      <span className="font-medium">{m.from === "collaborator" ? conversation.collaboratorName : conversation.customerName}</span>
                      <span>{formatTime(m.timestamp)}</span>
                    </div>
                    <p className="text-foreground">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score SAC</h3>
              <div className="rounded-md border border-border bg-card p-3">
                <ScoreBar score={conversation.score} />
                <dl className="mt-3 space-y-2 text-xs">
                  {[
                    { k: "Tempo de resposta", v: breakdown.time, w: 40 },
                    { k: "Resolução", v: breakdown.resolution, w: 35 },
                    { k: "Conversão", v: breakdown.conversion, w: 25 },
                  ].map((row) => (
                    <div key={row.k} className="flex items-center justify-between">
                      <dt className="text-muted-foreground">{row.k} <span className="text-[10px]">({row.w}%)</span></dt>
                      <dd className="font-medium tabular-nums">{row.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3 w-3" /> Sugestões da IA
              </h3>
              <ul className="space-y-2 rounded-md border border-border bg-card p-3 text-xs">
                {suggestions.map((s) => (
                  <li key={s} className="flex gap-2"><span className="text-brand">•</span>{s}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
