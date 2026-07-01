import type { Client } from '@/types'
import { DOW_LABELS_FULL, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'

type NameFields = Pick<Client, 'first_name' | 'last_name'>

export function formatClientName(c: NameFields): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

export function formatClientLabel(c: NameFields & Pick<Client, 'phone' | 'id'>): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone || c.id
}

const pad = (n: number) => String(n).padStart(2, '0')

/* ── Гроші ──────────────────────────────────────────────────────
   Єдине форматування. Грн (₴), без копійок. uk-UA → пробіл-роздільник тисяч.
   Знак ± і «— для 0» лишаються на місці виклику. */
export function formatMoney(n: number): string {
  return `${n.toLocaleString('uk-UA')} ₴`
}

/* ── Дати (display) ─────────────────────────────────────────────
   formatDate      → ДД.ММ.РРРР
   formatDateShort → ДД.ММ (без року)
   formatDateYY    → ДД.ММ.РР (2-значний рік)
   Вхід — ISO-рядок або Date. Для РРРР-ММ-ДД (input value) див. dateUtils: toYMD/isoToYMD. */
export function formatDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export function formatDateShort(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
}

export function formatDateYY(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** «14:00» — година:хвилина з Date (локальний час пристрою). */
export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** «Пʼятниця, 5 червня, 14:00 – 15:00» — повна дата + діапазон часу заняття.
 *  Вживає кабінет клієнта (списки візитів і деталі). */
export function fullWhen(startISO: string, durationMin: number): string {
  const start = new Date(startISO)
  const end = new Date(start.getTime() + durationMin * 60000)
  const dow = DOW_LABELS_FULL[start.getDay()]
  return `${dow}, ${start.getDate()} ${MONTHS_UK_GENITIVE[start.getMonth()]}, ${hhmm(start)} – ${hhmm(end)}`
}

/** Українське відмінювання слова «година» за числом: 1→година, 2-4→години, 0/5+→годин.
 *  (Залишок занять у студії рахується годинами — доменна одиниця.) */
export function pluralHours(n: number): string {
  const abs = Math.abs(n)
  const m10 = abs % 10, m100 = abs % 100
  if (m10 === 1 && m100 !== 11) return 'година'
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'години'
  return 'годин'
}

/** Знахідний відмінок «години» для конструкції «Нарахували N ___»:
 *  1→годину, 2-4→години, 0/5-20/11-14→годин. Відмінюється за модулем. */
export function pluralHoursAccusative(n: number): string {
  const abs = Math.abs(n)
  const m10 = abs % 10, m100 = abs % 100
  if (m10 === 1 && m100 !== 11) return 'годину'
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'години'
  return 'годин'
}

/** «43 години» / «−2 години» — число + відмінена «година».
 *  Знак — типографський мінус (−), відмінювання за модулем. */
export function formatHours(n: number): string {
  const sign = n < 0 ? '−' : ''
  return `${sign}${Math.abs(n)} ${pluralHours(n)}`
}

export function formatSaleDatetime(iso: string): string {
  const d = new Date(iso)
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
  const h = d.getHours(), m = d.getMinutes()
  if (h === 0 && m === 0) return date
  return `${date} ${pad(h)}:${pad(m)}`
}

export function nowDatetimeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function datetimeLocalToDisplay(dt: string): string {
  if (!dt) return ''
  const [datePart, timePart = '00:00'] = dt.split('T')
  const [year, month, day] = datePart.split('-')
  return `${day}.${month}.${year} ${timePart}`
}

export function parseDisplayToDatetimeLocal(text: string): string | null {
  const m = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/)
  if (m) {
    const [, day, month, year, h, min] = m
    return `${year}-${pad(Number(month))}-${pad(Number(day))}T${pad(Number(h))}:${pad(Number(min))}`
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text
  return null
}
