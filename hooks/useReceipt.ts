'use client'
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatHours } from '@/lib/formatters'
import { ticketTypeNominativeLabel } from '@/lib/badges'
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
      '',
      `Абонементи станом на ${now}:`,
      ...stateLines,
      ...debtLines,
    ].join('\n')
  }, [])

  // Для CopyButton: сам лише будує текст (без запису в буфер) і виставляє per-row стан.
  const prepareReceipt = useCallback(async (sale: Sale): Promise<string> => {
    const id = sale.id
    setState(id, 'copying')
    try {
      const message = await buildMessage(sale)
      setState(id, 'done')
      return message
    } catch (err) {
      console.error('[useReceipt] build error:', err)
      setState(id, 'error')
      throw err
    }
  }, [buildMessage])

  return {
    getState,
    prepareReceipt,
  }
}
