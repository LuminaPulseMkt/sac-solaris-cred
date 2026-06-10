import { Mail, MessageCircle, MessageSquare } from "lucide-react";
import { Tag } from "@/components/status-tag";
import type { Channel } from "@/types/sac";
import { channelLabel } from "@/lib/sac/format";

export function ChannelBadge({ channel }: { channel: Channel }) {
  if (channel === "whatsapp") {
    return (
      <Tag tone="success" className="gap-1">
        <MessageCircle className="h-3 w-3" /> {channelLabel.whatsapp}
      </Tag>
    );
  }
  if (channel === "chat") {
    return (
      <Tag tone="info" className="gap-1">
        <MessageSquare className="h-3 w-3" /> {channelLabel.chat}
      </Tag>
    );
  }
  return (
    <Tag tone="muted" className="gap-1">
      <Mail className="h-3 w-3" /> {channelLabel.email}
    </Tag>
  );
}
