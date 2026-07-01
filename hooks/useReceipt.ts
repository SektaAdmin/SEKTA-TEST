'use client'
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatMoney, formatClientName } from '@/lib/formatters'
import {
  getClientSessionBalances,
  type Sale,
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
    const [{ data: balances }, { data: labelMap }] = await Promise.all([
      getClientSessionBalances(supabase, sale.client_id),
      listTrainingTypeLabels(supabase),
    ])

    const now = new Date().toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Kyiv',
    })

    // Перший рядок: що саме зафіксовано
    const depDelta = sale.amount_given - sale.price_paid
    const isDeposit = !sale.ticket_id
    let paidLine: string
    if (!isDeposit) {
      const hours = sale.sessions
      paidLine = hours != null
        ? `Зафіксувала оплату абонемента на ${hours} год`
        : `Зафіксувала оплату абонемента${sale.ticket_name ? ` «${sale.ticket_name}»` : ''}`
    } else if (depDelta >= 0) {
      paidLine = `Зафіксувала поповнення депозиту на ${formatMoney(depDelta)}`
    } else {
      paidLine = `Зафіксувала списання з депозиту на ${formatMoney(Math.abs(depDelta))}`
    }

    // Повний стан абонементів — тільки ненульові залишки
    const nonZero = balances.filter(b => b.sessions_balance !== 0)
    const stateLines = nonZero.length > 0
      ? nonZero.map(b => `${labelMap[b.ticket_type] ?? b.ticket_type}: ${b.sessions_balance} год`)
      : ['Залишків немає']

    const clientName = formatClientName(sale.clients)

    return [
      clientName,
      '',
      paidLine,
      '',
      `Стан абонементів на ${now}`,
      ...stateLines,
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
