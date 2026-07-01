'use client'
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatMoney, formatHours, pluralHoursAccusative } from '@/lib/formatters'
import { ticketTypeGenitiveLabel, ticketTypeNominativeLabel } from '@/lib/badges'
import {
  getClientSessionBalances,
  getSalesAtSameMoment,
  type Sale,
  type AccrualSale,
} from '@/lib/queries/sales'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'

type ReceiptState = 'idle' | 'copying' | 'done' | 'error'

/**
 * Формує текстове повідомлення для клієнта про зафіксовану оплату
 * + повний актуальний стан абонемента, і копіює його в буфер.
 * Замінило генерацію PNG-квитанції.
 */
export function useReceipt() {
  // Стан кожного рядка окремо
  const [rowStates, setRowStates] = useState<Record<string, ReceiptState>>({})

  function getState(saleId: string): ReceiptState {
    return rowStates[saleId] ?? 'idle'
  }

  function setState(saleId: string, st: ReceiptState) {
    setRowStates(s => ({ ...s, [saleId]: st }))
  }

  const buildMessage = useCallback(async (sale: Sale): Promise<string> => {
    const [{ data: balances }, { data: labelMap }, { data: siblings }] = await Promise.all([
      getClientSessionBalances(supabase, sale.client_id),
      listTrainingTypeLabels(supabase),
      getSalesAtSameMoment(supabase, sale.client_id, sale.created_at),
    ])

    const now = new Date().toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Kyiv',
    })

    // Оплата кількох абонементів = кілька окремих продажів у той самий момент.
    // Об'єднуємо їх в одне повідомлення: години сумуємо за типом, депозит — окремо.
    const group: AccrualSale[] = siblings.length > 0 ? siblings : [sale]
    const bySessionType = new Map<string, { sessions: number; name: string | null }>()
    let depDelta = 0
    for (const r of group) {
      if (r.ticket_id && r.sessions != null) {
        const key = r.ticket_type ?? ''
        const cur = bySessionType.get(key) ?? { sessions: 0, name: r.ticket_name }
        cur.sessions += r.sessions
        bySessionType.set(key, cur)
      } else {
        depDelta += r.amount_given - r.price_paid
      }
    }

    // Кожне нарахування як іменникова фраза: «5 годин групових тренувань».
    const sessionItems = Array.from(bySessionType).map(([type, { sessions, name }]) => {
      const category = ticketTypeGenitiveLabel(
        type,
        (labelMap[type] ?? name ?? '').toLowerCase(),
      )
      return `${sessions} ${pluralHoursAccusative(sessions)}${category ? ` ${category}` : ''}`
    })
    const depItems: string[] =
      depDelta > 0 ? [`поповнення депозиту на ${formatMoney(depDelta)}`]
      : depDelta < 0 ? [`списання з депозиту ${formatMoney(Math.abs(depDelta))}`]
      : []
    const allItems = [...sessionItems, ...depItems]

    // Один рядок для однієї позиції (зберігаємо звичну фразу), список — для кількох.
    let accrualLines: string[]
    if (allItems.length > 1) {
      accrualLines = ['Нараховано:', ...allItems.map(i => `— ${i}`)]
    } else if (sessionItems.length === 1) {
      accrualLines = [`Нарахували ${sessionItems[0]}.`]
    } else if (depDelta < 0) {
      accrualLines = [`Списали з депозиту ${formatMoney(Math.abs(depDelta))}.`]
    } else {
      accrualLines = [`Поповнили депозит на ${formatMoney(depDelta)}.`]
    }

    // Клієнтські назви абонементів: узагальнена назва («Групове тренування»),
    // а не бренд-лейбл з training_types («Exotic»). Fallback — лейбл із БД.
    const label = (type: string) => {
      const nom = ticketTypeNominativeLabel(type)
      return nom === type ? (labelMap[type] ?? type) : nom
    }

    // Повний стан абонементів — лише ненульові залишки, плюси зверху, мінуси знизу.
    const nonZero = balances.filter(b => b.sessions_balance !== 0)
    const positives = nonZero.filter(b => b.sessions_balance > 0)
    const negatives = nonZero.filter(b => b.sessions_balance < 0)
    const ordered = [...positives, ...negatives]
    const stateLines = ordered.length > 0
      ? ordered.map(b => `${label(b.ticket_type)}: ${formatHours(b.sessions_balance)}`)
      : ['Залишків немає']

    // Пояснення до боргу: рядок лише якщо є від'ємні залишки.
    let debtLines: string[] = []
    if (negatives.length === 1) {
      const b = negatives[0]
      debtLines = [
        '',
        `Зверніть увагу: по «${label(b.ticket_type)}» баланс ${formatHours(b.sessions_balance)}.`,
      ]
    } else if (negatives.length > 1) {
      debtLines = [
        '',
        'Зверніть увагу: є від’ємний баланс по кількох абонементах:',
        ...negatives.map(b => `— ${label(b.ticket_type)}: ${formatHours(b.sessions_balance)}`),
      ]
    }

    return [
      'Дякуємо за оплату!',
      ...accrualLines,
      '',
      `Абонементи станом на ${now}:`,
      ...stateLines,
      ...debtLines,
    ].join('\n')
  }, [])

  const copyReceipt = useCallback(async (sale: Sale) => {
    const id = sale.id
    setState(id, 'copying')
    try {
      const message = await buildMessage(sale)
      await navigator.clipboard.writeText(message)
      setState(id, 'done')
    } catch (err) {
      console.error('[useReceipt] copy error:', err)
      setState(id, 'error')
    }
  }, [buildMessage])

  return {
    getState,
    copyReceipt,
  }
}
