'use client'
import { useState, useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import Button from '@/components/ui/Button'
import type { Client } from '@/types'

const supabase = createClient()

const inputCls = 'w-full px-3 py-[9px] bg-[var(--bg)] border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text)] text-[13px] outline-none transition-colors duration-150 placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:opacity-50'
const labelCls = 'text-[12px] font-medium text-[var(--text-2)]'
const errorHintCls = 'text-[11px] text-[var(--danger)] mt-0.5'

interface Transaction {
  id: string
  amount: number
  transaction_type: string
  balance_before: number
  balance_after: number
  description: string | null
  created_at: string
}

const TX_LABELS: Record<string, string> = {
  purchase:         'Покупка',
  deposit_topup:    'Поповнення',
  deduction:        'Списання',
  refund:           'Повернення',
  adjustment:       'Коригування',
  admin_adjustment: 'Коригування',
}

function formatTxDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getFullYear()).slice(2)}`
}

const clientSchema = z.object({
  first_name: z.string().min(1, "Ім'я обов'язкове"),
  last_name: z.string().min(1, "Прізвище обов'язкове"),
  phone: z.string().optional().or(z.literal('')),
  instagram_username: z.string().optional().or(z.literal('')),
  telegram_username: z.string().optional().or(z.literal('')),
})

type ClientFormValues = z.infer<typeof clientSchema>

interface Props {
  onClose: () => void
  onSaved: () => void
  client?: Client
}

export default function ClientModal({ onClose, onSaved, client }: Props) {
  const isEdit = !!client
  const titleId = useId()
  const modalRef = useModalFocus(onClose)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  async function loadHistory() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('balance_transactions')
      .select('id, amount, transaction_type, balance_before, balance_after, description, created_at')
      .eq('client_id', client!.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setTransactions((data as Transaction[]) ?? [])
    setHistoryLoading(false)
    setShowHistory(true)
  }

  function toggleHistory() {
    if (showHistory) { setShowHistory(false); return }
    loadHistory()
  }

  const { register, handleSubmit, formState: { errors } } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      first_name: client?.first_name ?? '',
      last_name: client?.last_name ?? '',
      phone: client?.phone ?? '',
      instagram_username: client?.instagram_username ?? '',
      telegram_username: client?.telegram_username ?? '',
    }
  })

  const onSubmit = async (data: ClientFormValues) => {
    setLoading(true)
    setError('')

    const phone = data.phone?.trim() || null
    const firstName = data.first_name.trim()
    const lastName = data.last_name.trim()

    if (phone) {
      let phoneQuery = supabase.from('clients').select('id, first_name, last_name').eq('phone', phone).limit(1)
      if (isEdit) phoneQuery = phoneQuery.neq('id', client.id)
      const { data: phoneMatches } = await phoneQuery
      if (phoneMatches && phoneMatches.length > 0) {
        const c = phoneMatches[0]
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Невідомий клієнт'
        setError(`Клієнт з таким номером телефону вже існує: ${name}`)
        setLoading(false)
        return
      }
    }

    let nameQuery = supabase.from('clients').select('id, phone').ilike('first_name', firstName).ilike('last_name', lastName).limit(1)
    if (isEdit) nameQuery = nameQuery.neq('id', client.id)
    const { data: nameMatches } = await nameQuery
    if (nameMatches && nameMatches.length > 0) {
      const c = nameMatches[0]
      setError(`Клієнт з таким ім'ям вже існує${c.phone ? ` (${c.phone})` : ''}`)
      setLoading(false)
      return
    }

    const payload = {
      first_name: firstName,
      last_name: lastName,
      phone,
      instagram_username: data.instagram_username?.trim() || null,
      telegram_username: data.telegram_username?.trim() || null,
    }

    if (isEdit) {
      const { error: updateError } = await supabase.from('clients').update(payload).eq('id', client.id)
      if (updateError) { setError(updateError.message); setLoading(false); return }
    } else {
      const { error: insertError } = await supabase.from('clients').insert(payload)
      if (insertError) { setError(insertError.message); setLoading(false); return }
    }

    onSaved()
  }

  const prefixCls = 'px-3 py-2 bg-[var(--bg-3)] border border-[0.5px] border-r-0 border-[var(--border)] rounded-l-[var(--radius-sm)] text-[var(--text-3)] text-[13px]'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className="flex flex-col w-[440px] max-h-[90vh] bg-[var(--bg-2)] border border-[0.5px] border-[var(--border-hover)] rounded-[var(--radius)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[0.5px] border-[var(--border)]">
          <h2 id={titleId} className="text-[15px] font-semibold text-[var(--text)] m-0">
            {isEdit ? 'Редагувати клієнта' : 'Новий клієнт'}
          </h2>
          <button onClick={onClose} aria-label="Закрити" className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors text-[16px] leading-none cursor-pointer bg-transparent border-none">✕</button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="client-first-name" className={labelCls}>Ім'я <span className="text-[var(--danger)]">*</span></label>
              <input id="client-first-name" type="text" className={inputCls} {...register('first_name')} placeholder="Анна" disabled={loading} />
              {errors.first_name && <p className={errorHintCls} role="alert">{errors.first_name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="client-last-name" className={labelCls}>Прізвище <span className="text-[var(--danger)]">*</span></label>
              <input id="client-last-name" type="text" className={inputCls} {...register('last_name')} placeholder="Іваненко" disabled={loading} />
              {errors.last_name && <p className={errorHintCls} role="alert">{errors.last_name.message}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="client-phone" className={labelCls}>Телефон</label>
            <input id="client-phone" type="tel" className={inputCls} {...register('phone')} placeholder="+380 XX XXX XX XX" disabled={loading} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="client-instagram" className={labelCls}>Instagram</label>
            <div className="flex items-center">
              <span className={prefixCls}>@</span>
              <input id="client-instagram" type="text" className={`${inputCls} rounded-l-none`} {...register('instagram_username')} placeholder="username" disabled={loading} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="client-telegram" className={labelCls}>Telegram</label>
            <div className="flex items-center">
              <span className={prefixCls}>@</span>
              <input id="client-telegram" type="text" className={`${inputCls} rounded-l-none`} {...register('telegram_username')} placeholder="username" disabled={loading} />
            </div>
          </div>

          {isEdit && (
            <>
              <button
                type="button"
                className="text-[12px] text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors text-left cursor-pointer bg-transparent border-none"
                onClick={toggleHistory}
              >
                {showHistory ? '▲' : '▼'} Історія транзакцій
              </button>

              {(showHistory || historyLoading) && (
                <div className="border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] overflow-x-auto">
                  {historyLoading ? (
                    <p className="text-[12px] text-[var(--text-3)] p-3">Завантаження...</p>
                  ) : transactions.length === 0 ? (
                    <p className="text-[12px] text-[var(--text-3)] p-3">Транзакцій немає</p>
                  ) : (
                    <table className="w-full text-[12px] border-collapse">
                      <thead>
                        <tr className="border-b border-[0.5px] border-[var(--border)]">
                          {['Дата','Тип','Сума','Баланс','Опис'].map(h => (
                            <th key={h} className="text-left text-[var(--text-3)] font-medium px-3 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map(tx => (
                          <tr key={tx.id} className="border-b border-[0.5px] border-[var(--border)] last:border-0">
                            <td className="px-3 py-2 text-[var(--text-3)] whitespace-nowrap">{formatTxDate(tx.created_at)}</td>
                            <td className="px-3 py-2 text-[var(--text-2)]">{TX_LABELS[tx.transaction_type] ?? tx.transaction_type}</td>
                            <td className={`px-3 py-2 font-medium ${tx.amount > 0 ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
                              {tx.amount > 0 ? '+' : ''}{Number(tx.amount).toLocaleString('uk-UA')}
                            </td>
                            <td className="px-3 py-2 text-[var(--text-2)]">{Number(tx.balance_after).toLocaleString('uk-UA')}</td>
                            <td className="px-3 py-2 text-[var(--text-3)]">{tx.description ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}

          {error && <p className="text-[12px] text-[var(--danger)] bg-[var(--danger-dim)] px-3 py-2 rounded-[var(--radius-sm)]" role="alert">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[0.5px] border-[var(--border)]">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Скасувати</Button>
          <Button variant="primary" onClick={handleSubmit(onSubmit)} loading={loading}>
            {isEdit ? 'Оновити' : 'Зберегти'}
          </Button>
        </div>
      </div>
    </div>
  )
}
