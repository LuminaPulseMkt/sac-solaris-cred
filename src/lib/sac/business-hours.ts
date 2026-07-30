/**
 * Regras de horário comercial usadas nas análises de conversas.
 *
 * As análises devem considerar apenas mensagens que ocorreram em dias úteis
 * e dentro da janela comercial (por padrão 08:00–20:00), com possibilidade de
 * alterar horário/dias em Configurações → Geral.
 */

export const BUSINESS_HOURS_KEYS = {
  enabled: "business_hours_enabled",
  start: "business_hours_start",
  end: "business_hours_end",
  days: "business_days",
  timezone: "business_timezone",
} as const;

export interface BusinessHoursConfig {
  /** Quando false, nenhuma filtragem é aplicada. */
  enabled: boolean;
  /** Minutos desde 00:00 (ex. 480 = 08:00). */
  startMinutes: number;
  /** Minutos desde 00:00 (ex. 1200 = 20:00). */
  endMinutes: number;
  /** Dias da semana permitidos, 0 = domingo … 6 = sábado. */
  days: number[];
  /** IANA timezone usado para avaliar hora local. */
  timezone: string;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: true,
  startMinutes: 8 * 60,
  endMinutes: 20 * 60,
  days: [1, 2, 3, 4, 5],
  timezone: "America/Sao_Paulo",
};

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** "08:30" -> 510. Retorna null quando inválido. */
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** 510 -> "08:30" */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Lê a configuração a partir dos valores brutos de `app_settings`. */
export function parseBusinessHoursConfig(
  raw: Record<string, string | null | undefined>,
): BusinessHoursConfig {
  const enabledRaw = raw[BUSINESS_HOURS_KEYS.enabled];
  const start = parseTimeToMinutes(raw[BUSINESS_HOURS_KEYS.start]);
  const end = parseTimeToMinutes(raw[BUSINESS_HOURS_KEYS.end]);

  const daysRaw = (raw[BUSINESS_HOURS_KEYS.days] ?? "").trim();
  const days = daysRaw
    ? Array.from(
        new Set(
          daysRaw
            .split(",")
            .map((d) => Number(d.trim()))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        ),
      ).sort((a, b) => a - b)
    : DEFAULT_BUSINESS_HOURS.days;

  const timezone = (raw[BUSINESS_HOURS_KEYS.timezone] ?? "").trim() || DEFAULT_BUSINESS_HOURS.timezone;

  return {
    enabled: enabledRaw == null || enabledRaw === "" ? DEFAULT_BUSINESS_HOURS.enabled : enabledRaw === "true",
    startMinutes: start ?? DEFAULT_BUSINESS_HOURS.startMinutes,
    endMinutes: end ?? DEFAULT_BUSINESS_HOURS.endMinutes,
    days: days.length ? days : DEFAULT_BUSINESS_HOURS.days,
    timezone,
  };
}

/** Retorna { weekday, minutes } de uma data no timezone configurado. */
export function localParts(date: Date, timezone: string): { weekday: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);
  } catch {
    // Timezone inválido — cai para UTC em vez de quebrar a análise.
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);
  }

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { weekday: weekdayMap[get("weekday")] ?? 0, minutes: hour * 60 + minute };
}

/** Verifica se um instante está em dia útil + janela comercial. */
export function isWithinBusinessHours(
  timestamp: string | Date,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): boolean {
  if (!config.enabled) return true;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;

  const { weekday, minutes } = localParts(date, config.timezone);
  if (!config.days.includes(weekday)) return false;

  // Janela que cruza a meia-noite (ex. 20:00 → 06:00).
  if (config.endMinutes <= config.startMinutes) {
    return minutes >= config.startMinutes || minutes < config.endMinutes;
  }
  return minutes >= config.startMinutes && minutes < config.endMinutes;
}

/** Filtra qualquer coleção com timestamp para manter só o horário comercial. */
export function filterBusinessHours<T>(
  items: T[],
  getTimestamp: (item: T) => string | Date,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): T[] {
  if (!config.enabled) return items;
  return items.filter((item) => isWithinBusinessHours(getTimestamp(item), config));
}

/** Descrição curta para exibir na UI / no prompt da IA. */
export function describeBusinessHours(config: BusinessHoursConfig): string {
  if (!config.enabled) return "Sem filtro de horário (24/7)";
  const days = config.days.map((d) => WEEKDAY_LABELS[d]).join(", ");
  return `${days} · ${minutesToTime(config.startMinutes)}–${minutesToTime(config.endMinutes)} (${config.timezone})`;
}
