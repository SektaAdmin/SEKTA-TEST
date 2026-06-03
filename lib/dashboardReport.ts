import { DOW_LABELS_FULL } from '@/lib/dateUtils'
import { formatDateShort } from '@/lib/formatters'

/* Чиста логіка звіту «хто піде в мінус по сесіях сьогодні».
   Портування Google Apps Script: групування занять + генерація тексту
   для надсилання тренерам у телеграм. Без UI/Supabase — тестується окремо. */

/** Ярлики типів індив-занять для тексту звіту (НЕ ticketTypeShortLabel — там Дует/Тріо). */
const INDIV_REPORT_LABEL: Record<string, string> = {
  individual: 'Індив',
  individualduo: 'Індив Duo',
  individualtrio: 'Індив Trio',
}

export type DebtRow = {
  time: string          // "10:00"
  startMin: number      // для сортування
  hall: string
  trainer: string
  ticketType: string
  clientName: string
  balance: number       // ефективний залишок (< 0)
}

export type DebtGroup = {
  time: string
  startMin: number
  hall: string
  trainer: string
  indivLabel: string    // '' якщо не індив
  clients: { name: string; balance: number }[]
}

/** Групує рядки боржників за ключем час||зал||тренер||тип-індива. */
export function groupDebtRows(rows: DebtRow[]): DebtGroup[] {
  const map = new Map<string, DebtGroup>()

  for (const r of rows) {
    const indivLabel = INDIV_REPORT_LABEL[r.ticketType] ?? ''
    const key = `${r.time}||${r.hall}||${r.trainer}||${indivLabel}`
    let g = map.get(key)
    if (!g) {
      g = { time: r.time, startMin: r.startMin, hall: r.hall, trainer: r.trainer, indivLabel, clients: [] }
      map.set(key, g)
    }
    g.clients.push({ name: r.clientName, balance: r.balance })
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.startMin !== b.startMin) return a.startMin - b.startMin
    return a.hall.localeCompare(b.hall, 'uk')
  })
}

/** Генерує текст звіту для копіювання тренерам. */
export function buildDebtReportText(date: Date, groups: DebtGroup[]): string {
  const header = `${DOW_LABELS_FULL[date.getDay()]} ${formatDateShort(date)}`
  if (groups.length === 0) return `${header}\n\nБоржників немає.`

  let text = `${header}\n\n`
  for (const g of groups) {
    text += `${g.time} ${g.trainer} (${g.hall})\n`
    for (const c of g.clients) {
      const suffix = g.indivLabel ? ` — ${g.indivLabel}` : ''
      text += `${c.name} (${c.balance})${suffix}\n`
    }
    text += '\n'
  }
  return text.trimEnd()
}
