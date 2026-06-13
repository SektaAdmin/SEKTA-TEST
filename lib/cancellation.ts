/**
 * Дедлайн безкоштовного скасування запису — клієнтська копія БД-функції
 * `cancellation_deadline` (RPC, STABLE). Тримаємо логіку синхронною з БД, щоб
 * кабінет клієнта міг показати правило ДО виклику `client_cancel` (модалка
 * підтвердження) без зайвого запиту.
 *
 * Правило (рахується в часовому поясі студії — Europe/Kyiv, як у БД):
 *   - початок заняття (за київським часом) < 14:00 → дедлайн 19:00 ПОПЕРЕДНЬОГО дня;
 *   - початок >= 14:00 → дедлайн = початок − 6 годин.
 * До дедлайна скасування безкоштовне, після — зі списанням заняття.
 *
 * ⚠️ Прив'язка саме до Europe/Kyiv (не до таймзони пристрою) — критично: БД
 * рахує в київському, інакше клієнт у іншому поясі побачить хибний дедлайн.
 */

const KYIV_TZ = 'Europe/Kyiv'

/** Частини київського локального часу для UTC-інстанта (через Intl, з урахуванням DST). */
export function kyivParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: KYIV_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(d)) p[part.type] = part.value
  // 'hour' у hour12:false може приходити як '24' опівночі — нормалізуємо до 0.
  const hour = Number(p.hour) % 24
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour, minute: Number(p.minute) }
}

/** Зсув Europe/Kyiv від UTC (мс) для даного інстанта — додатний влітку (+3 год). */
function kyivOffsetMs(d: Date): number {
  const p = kyivParts(d)
  // Той самий «настінний час» зібраний як UTC мінус фактичний UTC = зсув пояса.
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0)
  return asUtc - Math.floor(d.getTime() / 60000) * 60000
}

/** UTC-інстант для київського настінного часу заданого дня/години. */
function kyivWallToUtc(year: number, month1: number, day: number, hour: number, minute = 0): Date {
  // Перше наближення: трактуємо настінний час як UTC, потім коригуємо на зсув
  // пояса в ту мить (зсув майже сталий у межах доби — DST-перемикання о 03:00-04:00
  // дедлайнів 19:00/−6год не зачіпає).
  const guessUtc = Date.UTC(year, month1 - 1, day, hour, minute, 0)
  const offset = kyivOffsetMs(new Date(guessUtc))
  return new Date(guessUtc - offset)
}

/** Дедлайн безкоштовного скасування для заняття з початком startISO. */
export function cancellationDeadline(startISO: string): Date {
  const start = new Date(startISO)
  const k = kyivParts(start)

  if (k.hour < 14) {
    // 19:00 київського попереднього дня. Date.UTC коректно відкочує через межі
    // місяця/року при day-1 (день 0 → останній день попереднього місяця).
    return kyivWallToUtc(k.year, k.month, k.day - 1, 19, 0)
  }
  // початок − 6 годин
  return new Date(start.getTime() - 6 * 60 * 60 * 1000)
}

/** Чи скасування зараз безкоштовне (до дедлайна). */
export function isFreeCancellation(startISO: string, nowMs: number = Date.now()): boolean {
  return nowMs <= cancellationDeadline(startISO).getTime()
}
