import OpenAI from "openai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AudioTranscriptionInput = {
  base64?: string;
  url?: string;
  mimeType?: string;
  durationSeconds?: number;
};

async function getSettingValue(key: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? "";
}

function normalizeMimeType(mimeType?: string): string {
  return (mimeType ?? "audio/ogg").split(";")[0].trim().toLowerCase() || "audio/ogg";
}

function extensionForMimeType(mimeType?: string): string {
  const mime = normalizeMimeType(mimeType);
  const extMap: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "mp4",
    "video/mp4": "mp4",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/opus": "opus",
    "audio/aac": "aac",
    "audio/m4a": "m4a",
  };
  return extMap[mime] ?? "ogg";
}

function parseDataUri(value?: string): { mimeType?: string; base64?: string } {
  if (!value) return {};
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?,(.+)$/s);
  if (!match) return { base64: value };
  return { mimeType: normalizeMimeType(match[1]), base64: match[2] };
}

function prefersEvolutionConversion(params: AudioTranscriptionInput): boolean {
  const rawMime = params.mimeType ?? "";
  const mime = normalizeMimeType(rawMime);
  return mime === "audio/ogg" || mime === "audio/opus" || /opus/i.test(rawMime);
}

export async function transcribeAudio(params: AudioTranscriptionInput): Promise<string | null> {
  const apiKey = await getSettingValue("openai_api_key");
  if (!apiKey) {
    throw new Error("OpenAI API Key não configurada em Configurações → Integrações.");
  }

  const enabled = await getSettingValue("ai_transcribe_audio");
  if (enabled === "false") return null;

  const maxDuration = parseInt(
    (await getSettingValue("ai_transcribe_max_duration_s")) || "300",
    10,
  );
  if (params.durationSeconds && params.durationSeconds > maxDuration) {
    return `[áudio longo — ${Math.round(params.durationSeconds / 60)}min — transcrição desabilitada acima de ${Math.round(maxDuration / 60)}min]`;
  }

  let audioBuffer: Buffer;

  if (params.base64) {
    const raw = params.base64.includes(",") ? params.base64.split(",").pop() ?? "" : params.base64;
    audioBuffer = Buffer.from(raw, "base64");
  } else if (params.url) {
    const res = await fetch(params.url);
    if (!res.ok) throw new Error(`Falha ao baixar áudio: HTTP ${res.status} ${res.statusText}`);
    audioBuffer = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("Payload de áudio sem base64 e sem URL.");
  }

  if (audioBuffer.byteLength < 128) {
    throw new Error("Áudio vazio ou inválido recebido para transcrição.");
  }

  const mime = normalizeMimeType(params.mimeType);
  const ext = extensionForMimeType(mime);

  try {
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
    const message = e instanceof Error ? e.message : String(e);
    console.error("[transcribeAudio] erro:", message);
    throw new Error(`Falha na transcrição (${mime}/${ext}): ${message}`);
  }
}

export function extractAudioFromPayload(
  message: Record<string, unknown>,
): AudioTranscriptionInput | null {
  const audioMsg = (message.audioMessage ?? message.pttMessage) as
    | Record<string, unknown>
    | undefined;
  if (!audioMsg) return null;

  // Evolution às vezes envia base64 no topo da mensagem
  const topBase64 = (message as { base64?: string }).base64;

  return {
    base64: (audioMsg.base64 as string | undefined) ?? topBase64,
    url: (audioMsg.url ?? audioMsg.mediaUrl ?? audioMsg.directPath) as string | undefined,
    mimeType: normalizeMimeType((audioMsg.mimetype ?? audioMsg.mimeType ?? "audio/ogg") as string),
    durationSeconds: typeof audioMsg.seconds === "number" ? audioMsg.seconds : undefined,
  };
}

function readNestedString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Busca o base64 do áudio na Evolution API.
 * A URL do WhatsApp é criptografada (.enc) — só a Evolution sabe descriptografar.
 */
export async function fetchEvolutionMediaBase64(params: {
  instance: string;
  messagePayload: unknown;
  convertToMp4?: boolean;
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
        body: JSON.stringify({ message: params.messagePayload, convertToMp4: params.convertToMp4 ?? false }),
      },
    );
    if (!res.ok) {
      console.warn("[fetchEvolutionMediaBase64] HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const bodyText = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(bodyText) as unknown;
    } catch {
      json = null;
    }
    const base64 =
      (typeof json === "string" ? json : undefined) ??
      readNestedString(json, ["base64"]) ??
      readNestedString(json, ["data"]) ??
      readNestedString(json, ["data", "base64"]) ??
      readNestedString(json, ["media", "base64"]) ??
      (json ? undefined : bodyText.trim());
    const mimetype =
      readNestedString(json, ["mimetype"]) ??
      readNestedString(json, ["mimeType"]) ??
      readNestedString(json, ["data", "mimetype"]) ??
      readNestedString(json, ["data", "mimeType"]);
    if (!base64) return null;
    const parsedBase64 = parseDataUri(base64);
    return {
      base64: parsedBase64.base64 ?? base64,
      mimeType: parsedBase64.mimeType ?? normalizeMimeType(mimetype ?? (params.convertToMp4 ? "audio/mp4" : undefined)),
    };
  } catch (e) {
    console.error("[fetchEvolutionMediaBase64] erro:", e);
    return null;
  }
}

export async function prepareAudioForTranscription(
  audioInfo: AudioTranscriptionInput,
  context: { instance: string; messagePayload: unknown },
): Promise<AudioTranscriptionInput> {
  const shouldConvert = prefersEvolutionConversion(audioInfo);
  if ((!audioInfo.base64 || shouldConvert) && context.instance) {
    const fetched = await fetchEvolutionMediaBase64({
      instance: context.instance,
      messagePayload: context.messagePayload,
      convertToMp4: shouldConvert,
    });
    if (fetched?.base64) {
      return {
        ...audioInfo,
        base64: fetched.base64,
        mimeType: fetched.mimeType ?? (shouldConvert ? "audio/mp4" : audioInfo.mimeType),
      };
    }
  }

  return {
    ...audioInfo,
    mimeType: normalizeMimeType(audioInfo.mimeType),
  };
}
