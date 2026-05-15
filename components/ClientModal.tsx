'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import { SocialHandleInput } from '@/components/ui/SocialHandleInput'
import type { Client } from '@/types'
import styles from './ClientModal.module.css'


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
      let phoneQuery = supabase
        .from('clients')
        .select('id, first_name, last_name')
        .eq('phone', phone)
        .limit(1)

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

    let nameQuery = supabase
      .from('clients')
      .select('id, phone')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .limit(1)

    if (isEdit) nameQuery = nameQuery.neq('id', client.id)

    const { data: nameMatches } = await nameQuery

    if (nameMatches && nameMatches.length > 0) {
      const c = nameMatches[0]
      const phoneStr = c.phone ? ` (${c.phone})` : ''
      setError(`Клієнт з таким ім'ям вже існує${phoneStr}`)
      setLoading(false)
      return
    }

    const payload = {
      first_name: firstName,
      last_name: lastName,
      phone: phone,
      instagram_username: data.instagram_username?.trim() || null,
      telegram_username: data.telegram_username?.trim() || null,
    }

    if (isEdit) {
      const { error: updateError } = await supabase
        .from('clients')
        .update(payload)
        .eq('id', client.id)

      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }
    } else {
      const { error: insertError } = await supabase.from('clients').insert(payload)

      if (insertError) {
        setError(insertError.message)
        setLoading(false)
        return
      }
    }

    onSaved()
  }

  return (
    <ModalShell
      title={isEdit ? 'Редагувати клієнта' : 'Новий клієнт'}
      onClose={onClose}
      footer={
        <>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? 'Збереження...' : isEdit ? 'Оновити' : 'Зберегти'}
          </button>
        </>
      }
    >
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="client-first-name">
            Ім'я <span className={styles.required}>*</span>
          </label>
          <input
            id="client-first-name"
            type="text"
            {...register('first_name')}
            placeholder="Анна"
            disabled={loading}
          />
          {errors.first_name && (
            <p className={styles.errorHint} role="alert">{errors.first_name.message}</p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="client-last-name">
            Прізвище <span className={styles.required}>*</span>
          </label>
          <input
            id="client-last-name"
            type="text"
            {...register('last_name')}
            placeholder="Іваненко"
            disabled={loading}
          />
          {errors.last_name && (
            <p className={styles.errorHint} role="alert">{errors.last_name.message}</p>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="client-phone">Телефон</label>
        <input
          id="client-phone"
          type="tel"
          {...register('phone')}
          placeholder="+380 XX XXX XX XX"
          disabled={loading}
        />
      </div>

      <SocialHandleInput
        id="client-instagram"
        label="Instagram"
        registration={register('instagram_username')}
        disabled={loading}
      />

      <SocialHandleInput
        id="client-telegram"
        label="Telegram"
        registration={register('telegram_username')}
        disabled={loading}
      />

      {isEdit && (
        <>
          <button
            type="button"
            className={styles.historyToggle}
            onClick={toggleHistory}
          >
            {showHistory ? '▲' : '▼'} Історія транзакцій
          </button>

          {(showHistory || historyLoading) && (
            <div className={styles.historySection}>
              {historyLoading ? (
                <p className={styles.historyLoading}>Завантаження...</p>
              ) : transactions.length === 0 ? (
                <p className={styles.historyEmpty}>Транзакцій немає</p>
              ) : (
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Тип</th>
                      <th>Сума</th>
                      <th>Баланс</th>
                      <th>Опис</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id}>
                        <td className={styles.txDate}>{formatTxDate(tx.created_at)}</td>
                        <td className={styles.txType}>
                          {TX_LABELS[tx.transaction_type] ?? tx.transaction_type}
                        </td>
                        <td className={`${styles.txAmount} ${tx.amount > 0 ? styles.txPos : styles.txNeg}`}>
                          {tx.amount > 0 ? '+' : ''}{Number(tx.amount).toLocaleString('uk-UA')}
                        </td>
                        <td className={styles.txBalance}>
                          {Number(tx.balance_after).toLocaleString('uk-UA')}
                        </td>
                        <td className={styles.txDesc}>{tx.description ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
    </ModalShell>
  )
}
