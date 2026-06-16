'use client'
import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getClientSessionBalances,
  saveReceiptToSale,
  type Sale,
  type SessionBalance,
} from '@/lib/queries/sales'

type ReceiptState = 'idle' | 'generating' | 'copying' | 'done' | 'error'

interface UseReceiptOptions {
  onGenerated?: (updatedSale: Sale & { receipt_url: string }) => void
}

export interface ReceiptRenderData {
  sale: Sale
  balances: SessionBalance[]
}

export function useReceipt({ onGenerated }: UseReceiptOptions = {}) {
  // Стан кожного рядка окремо
  const [rowStates, setRowStates] = useState<Record<string, ReceiptState>>({})
  // Дані для рендеру прихованого ReceiptCard
  const [renderData, setRenderData] = useState<ReceiptRenderData | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  function getState(saleId: string): ReceiptState {
    return rowStates[saleId] ?? 'idle'
  }

  function setState(saleId: string, st: ReceiptState) {
    setRowStates(s => ({ ...s, [saleId]: st }))
  }

  const generateReceipt = useCallback(async (sale: Sale) => {
    const id = sale.id
    setState(id, 'generating')
    setRenderData(null)

    try {
      const { data: balances } = await getClientSessionBalances(supabase, sale.client_id)

      // Ставимо дані — React рендерить ReceiptCard в DOM
      setRenderData({ sale, balances })

      // Чекаємо два rAF щоб браузер завершив paint
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

      const el = cardRef.current
      if (!el) throw new Error('ReceiptCard ref not mounted')

      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
      })

      const fileName = `receipt-${id}-${Date.now()}.png`
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, blob, { contentType: 'image/png', upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName)
      const publicUrl = urlData.publicUrl

      const { error: saveError } = await saveReceiptToSale(supabase, id, publicUrl, balances)
      if (saveError) throw new Error(saveError)

      setRenderData(null)
      setState(id, 'done')
      onGenerated?.({ ...sale, receipt_url: publicUrl, session_balance_snapshot: balances })
    } catch (err) {
      console.error('[useReceipt] generate error:', err)
      setRenderData(null)
      setState(id, 'error')
    }
  }, [onGenerated])

  const copyReceipt = useCallback(async (sale: Sale) => {
    const id = sale.id

    // Якщо ще не згенерована — спочатку генеруємо
    if (!sale.receipt_url) {
      await generateReceipt(sale)
      return
    }

    setState(id, 'copying')
    try {
      const resp = await fetch(sale.receipt_url)
      const blob = await resp.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      setState(id, 'done')
    } catch (err) {
      console.error('[useReceipt] copy error:', err)
      setState(id, 'error')
    }
  }, [generateReceipt])

  return {
    cardRef,
    renderData,
    getState,
    generateReceipt,
    copyReceipt,
  }
}
