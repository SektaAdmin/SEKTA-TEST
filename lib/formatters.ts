import type { Client } from '@/types'

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
