import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Image as ImageIcon, Mic, FileText, MapPin, Sticker, Video } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ScoreBar } from "@/components/score-bar";
import { supabase } from "@/integrations/supabase/client";
import { formatTime, formatDateTime, formatDuration } from "@/lib/sac/format";

export const Route = createFileRoute("/conversas/$id")({
  head: () => ({
    meta: [
      { title: "Conversa — SAC" },
      { name: "description", content: "Detalhe da conversa em tempo real com score SAC e tempo de resposta." },
    ],
  }),
  component: ConversationChatPage,
});

type Message = {
  id: string;
  conversation_id: string;
  from_role: string;
  message_text: string | null;
  message_type: string;
  sent_at: string;
  response_time_s: number | null;
};

type Conversation = {
  id: string;
  lead_name: string | null;
  lead_phone: string;
  instance_name: string;
  status: string;
  converted: boolean;
  score_sac: number | null;
  avg_response_time_s: number | null;
  started_at: string;
  total_messages: number;
  operator_id: string;
};

async function fetchConversation(id: string): Promise<Conversation | null> {
  const { data } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
  return (data as Conversation | null) ?? null;
}

async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });
  return (data as Message[] | null) ?? [];
}

const typeIcon: Record<string, React.ReactNode> = {
  image: <ImageIcon className="h-3.5 w-3.5" />,
  audio: <Mic className="h-3.5 w-3.5" />,
  document: <FileText className="h-3.5 w-3.5" />,
  sticker: <Sticker className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  location: <MapPin className="h-3.5 w-3.5" />,
};

function rtTone(seconds: number): string {
  const m = seconds / 60;
  if (m <= 2) return "bg-success/15 text-success";
  if (m <= 5) return "bg-warning/15 text-warning";
  return "bg-danger/15 text-danger";
}

function ConversationChatPage() {
  const { id } = Route.useParams();
  const conv = useQuery({ queryKey: ["conversation", id], queryFn: () => fetchConversation(id) });
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchMessages(id).then((m) => { if (!cancelled) setMessages(m); });
    const channel = supabase
      .channel(`sac-conv-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id]);

  const conversation = conv.data;

  const durationLabel = useMemo(() => {
    if (!conversation) return "";
    const dur = (Date.now() - new Date(conversation.started_at).getTime()) / 1000;
    return formatDuration(dur);
  }, [conversation]);

  return (
    <>
      <AppHeader
        title={conversation?.lead_name ?? "Conversa"}
        subtitle={conversation ? `${conversation.lead_phone} · ${conversation.instance_name}` : ""}
        actions={
          <Link to="/conversas" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Link>
        }
      />
      <main className="flex-1 space-y-3 p-4 md:p-6">
        {conversation && (
          <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
            <Stat label="Score SAC" value={<ScoreBar score={conversation.score_sac ?? 0} />} />
            <Stat label="Tempo médio" value={<span className="text-sm">{conversation.avg_response_time_s ? formatDuration(conversation.avg_response_time_s) : "—"}</span>} />
            <Stat label="Mensagens" value={<span className="text-sm tabular-nums">{conversation.total_messages}</span>} />
            <Stat label="Iniciada" value={<span className="text-xs">{formatDateTime(conversation.started_at)} · {durationLabel}</span>} />
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-4">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((m, i) => {
                const isOp = m.from_role === "operator";
                const prev = messages[i - 1];
                const showRt = m.response_time_s != null && prev && prev.from_role !== m.from_role;
                return (
                  <li key={m.id}>
                    {showRt && (
                      <div className="my-2 flex justify-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${rtTone(m.response_time_s!)}`}>
                          ⏱ Resposta em {formatDuration(m.response_time_s!)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${isOp ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          isOp ? "bg-brand/15 text-foreground" : "bg-surface text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {m.message_type !== "text" && typeIcon[m.message_type]}
                          <span className="whitespace-pre-wrap break-words">{m.message_text}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">{formatTime(m.sent_at)}</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
