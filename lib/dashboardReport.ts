import { DOW_LABELS_FULL } from '@/lib/dateUtils'
import { formatDateShort } from '@/lib/formatters'

export type DebtGroup = {
  time: string
  startMin: number
  hall: string
  trainer: string
  indivLabel: string    // '' якщо не індив; short_label з training_types
  clients: { name: string; balance: number }[]
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
