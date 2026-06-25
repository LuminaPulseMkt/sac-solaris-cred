import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Image as ImageIcon, Mic, FileText, MapPin, Sticker, Video } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ScoreBar } from "@/components/score-bar";
import { AiAnalysisPanel } from "@/components/ai-analysis-panel";
import { supabase } from "@/integrations/supabase/client";
import { formatTime, formatDateTime, formatDuration } from "@/lib/sac/format";

export const Route = createFileRoute("/_authenticated/conversas/$id")({
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
  image: <ImageIcon size={14} />,
  audio: <Mic size={14} />,
  document: <FileText size={14} />,
  sticker: <Sticker size={14} />,
  video: <Video size={14} />,
  location: <MapPin size={14} />,
};

function rtTone(seconds: number): string {
  const m = seconds / 60;
  if (m <= 2) return "bg-success/15 text-success";
  if (m <= 5) return "bg-warning/15 text-warning";
  return "bg-danger/15 text-danger";
}

function ConversationChatPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const conv = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => fetchConversation(id),
    refetchInterval: 8_000,
  });

  const msgsQuery = useQuery({
    queryKey: ["messages", id],
    queryFn: () => fetchMessages(id),
    refetchInterval: 5_000,
    placeholderData: (prev) => prev,
  });

  const messages = msgsQuery.data ?? [];

  useEffect(() => {
    const channel = supabase
      .channel(`sac-msgs-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", id] });
          qc.invalidateQueries({ queryKey: ["conversation", id] });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[Realtime] Canal de mensagens com erro — usando polling");
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [id, qc]);

  const prevLengthRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  const conversation = conv.data;

  const durationLabel = useMemo(() => {
    if (!conversation) return "";
    const dur = (Date.now() - new Date(conversation.started_at).getTime()) / 1000;
    return formatDuration(dur);
  }, [conversation]);

  return (
    <>
      <AppHeader
        title={conversation?.lead_name ?? conversation?.lead_phone ?? "Conversa"}
        subtitle={conversation ? `${conversation.lead_phone} · ${conversation.instance_name}` : ""}
        actions={
          <Link
            to="/conversas"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Voltar
          </Link>
        }
      />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {conversation && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Score SAC" value={<ScoreBar score={conversation.score_sac ?? 0} />} />
            <Stat label="Tempo médio resposta" value={conversation.avg_response_time_s ? formatDuration(conversation.avg_response_time_s) : "—"} />
            <Stat label="Total mensagens" value={conversation.total_messages} />
            <Stat label="Início" value={`${formatDateTime(conversation.started_at)} · ${durationLabel}`} />
          </div>
        )}

        <AiAnalysisPanel conversationId={id} />

        <div className="rounded-xl border bg-card shadow-sm">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Mensagens</h2>
          </div>
          <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma mensagem ainda.
              </p>
            ) : (
              <div className="space-y-4">
                {messages.map((m, i) => {
                  const isOp = m.from_role === "operator";
                  const prev = messages[i - 1];
                  const showRt = m.response_time_s != null && prev && prev.from_role !== m.from_role;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isOp ? "items-end" : "items-start"}`}
                    >
                      {showRt && (
                        <div className={`mb-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${rtTone(m.response_time_s!)}`}>
                          <span className="inline-block">
                            ⏱ Resposta em {formatDuration(m.response_time_s!)}
                          </span>
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                          isOp
                            ? "bg-primary text-primary-foreground rounded-br-none"
                            : "bg-muted rounded-bl-none"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {m.message_type !== "text" && typeIcon[m.message_type]}
                          <span>{m.message_text}</span>
                        </div>
                        <div className={`text-[10px] mt-1 opacity-70 ${isOp ? "text-right" : "text-left"}`}>
                          {formatTime(m.sent_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold">
        {value}
      </div>
    </div>
  );
}
