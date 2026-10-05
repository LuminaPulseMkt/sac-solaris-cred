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

/**
 * Minutos corridos entre `from` e o horário local `minutesOfDay`, dentro da
 * mesma janela comercial em que `from` já está (sem cruzar dia). Usado só
 * internamente por `businessMinutesElapsed`.
 */
function minutesUntil(currentMinutes: number, targetMinutes: number): number {
  return targetMinutes - currentMinutes;
}

/**
 * Conta quantos minutos de `from` até `to` caem dentro do horário comercial
 * de `config`, pulando noites/fins de semana fora da janela (o "relógio" do
 * SLA pausa fora do expediente). Caminha em saltos (não minuto a minuto),
 * reamostrando a hora local a cada salto — por isso é seguro mesmo com
 * `to - from` cobrindo semanas. Como o Brasil não tem mais horário de
 * verão, usar aritmética de milissegundos reais pros saltos é exato para
 * `America/Sao_Paulo`; para outros fusos com DST pode haver um desvio de
 * até 1h, duas vezes por ano — aceitável pro caso de uso (alerta de SLA).
 */
export function businessMinutesElapsed(
  from: string | Date,
  to: string | Date,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): number {
  const start = from instanceof Date ? from : new Date(from);
  const end = to instanceof Date ? to : new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  if (!config.enabled) return Math.round((end.getTime() - start.getTime()) / 60_000);

  const wraps = config.endMinutes <= config.startMinutes;
  let total = 0;
  let cursor = start;
  let guard = 0;

  while (cursor < end && guard++ < 1000) {
    const { weekday, minutes } = localParts(cursor, config.timezone);
    const dayOk = config.days.includes(weekday);

    let inWindow: boolean;
    let minutesLeftInWindow: number;
    if (!wraps) {
      inWindow = dayOk && minutes >= config.startMinutes && minutes < config.endMinutes;
      minutesLeftInWindow = minutesUntil(minutes, config.endMinutes);
    } else {
      inWindow = dayOk && (minutes >= config.startMinutes || minutes < config.endMinutes);
      minutesLeftInWindow =
        minutes >= config.startMinutes ? 24 * 60 - minutes + config.endMinutes : minutesUntil(minutes, config.endMinutes);
    }

    if (inWindow) {
      const stepMs = Math.min(minutesLeftInWindow * 60_000, end.getTime() - cursor.getTime());
      total += stepMs / 60_000;
      cursor = new Date(cursor.getTime() + stepMs);
      continue;
    }

    // Fora da janela: pula pro próximo instante que pode estar dentro dela.
    let jumpMinutes: number;
    if (!dayOk) {
      jumpMinutes = 24 * 60 - minutes; // vira o dia e reavalia
    } else if (!wraps && minutes < config.startMinutes) {
      jumpMinutes = minutesUntil(minutes, config.startMinutes); // ainda não abriu hoje
    } else if (!wraps) {
      jumpMinutes = 24 * 60 - minutes; // já fechou hoje
    } else {
      jumpMinutes = minutesUntil(minutes, config.startMinutes); // intervalo diurno de uma janela que cruza meia-noite
    }
    const stepMs = Math.min(Math.max(jumpMinutes, 1) * 60_000, end.getTime() - cursor.getTime());
    cursor = new Date(cursor.getTime() + stepMs);
  }

  return Math.round(total);
}
