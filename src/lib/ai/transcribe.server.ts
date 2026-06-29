import OpenAI from "openai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getSettingValue(key: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? "";
}

export async function transcribeAudio(params: {
  base64?: string;
  url?: string;
  mimeType?: string;
  durationSeconds?: number;
}): Promise<string | null> {
  const apiKey = await getSettingValue("openai_api_key");
  if (!apiKey) return null;

  const enabled = await getSettingValue("ai_transcribe_audio");
  if (enabled === "false") return null;

  const maxDuration = parseInt(
    (await getSettingValue("ai_transcribe_max_duration_s")) || "300",
    10,
  );
  if (params.durationSeconds && params.durationSeconds > maxDuration) {
    return `[áudio longo — ${Math.round(params.durationSeconds / 60)}min — transcrição desabilitada acima de ${Math.round(maxDuration / 60)}min]`;
  }

  try {
    let audioBuffer: Buffer;

    if (params.base64) {
      const raw = params.base64.includes(",") ? params.base64.split(",")[1] : params.base64;
      audioBuffer = Buffer.from(raw, "base64");
    } else if (params.url) {
      const res = await fetch(params.url);
      if (!res.ok) throw new Error(`Falha ao baixar áudio: ${res.status}`);
      audioBuffer = Buffer.from(await res.arrayBuffer());
    } else {
      return null;
    }

    const mime = params.mimeType ?? "audio/ogg";
    const extMap: Record<string, string> = {
      "audio/ogg": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp4": "mp4",
      "audio/wav": "wav",
      "audio/webm": "webm",
      "audio/opus": "opus",
      "audio/aac": "aac",
    };
    const ext = extMap[mime] ?? "ogg";

    const openai = new OpenAI({ apiKey });
    const file = new File([new Uint8Array(audioBuffer)], `audio.${ext}`, { type: mime });

    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "pt",
      response_format: "text",
    });

    const text = typeof result === "string" ? result.trim() : "";
    return text || null;
  } catch (e) {
    console.error("[transcribeAudio] erro:", e);
    return null;
  }
}

export function extractAudioFromPayload(
  message: Record<string, unknown>,
): { base64?: string; url?: string; mimeType?: string; durationSeconds?: number } | null {
  const audioMsg = (message.audioMessage ?? message.pttMessage) as
    | Record<string, unknown>
    | undefined;
  if (!audioMsg) return null;

  // Evolution às vezes envia base64 no topo da mensagem
  const topBase64 = (message as { base64?: string }).base64;

  return {
    base64: (audioMsg.base64 as string | undefined) ?? topBase64,
    url: (audioMsg.url ?? audioMsg.mediaUrl ?? audioMsg.directPath) as string | undefined,
    mimeType: (audioMsg.mimetype ?? audioMsg.mimeType ?? "audio/ogg") as string,
    durationSeconds: typeof audioMsg.seconds === "number" ? audioMsg.seconds : undefined,
  };
}

/**
 * Busca o base64 do áudio na Evolution API.
 * A URL do WhatsApp é criptografada (.enc) — só a Evolution sabe descriptografar.
 */
export async function fetchEvolutionMediaBase64(params: {
  instance: string;
  messagePayload: unknown;
}): Promise<{ base64: string; mimeType?: string } | null> {
  const baseUrl = (await getSettingValue("evolution_api_url")).replace(/\/$/, "");
  const apiKey = await getSettingValue("evolution_api_key");
  if (!baseUrl || !apiKey || !params.instance) return null;

  try {
    const res = await fetch(
      `${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(params.instance)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ message: params.messagePayload, convertToMp4: false }),
      },
    );
    if (!res.ok) {
      console.warn("[fetchEvolutionMediaBase64] HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { base64?: string; mimetype?: string };
    if (!json.base64) return null;
    return { base64: json.base64, mimeType: json.mimetype };
  } catch (e) {
    console.error("[fetchEvolutionMediaBase64] erro:", e);
    return null;
  }
}
