'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { supabase } from '@/lib/supabase'
import { searchClientsByPhone, searchClientsByName, insertClient, updateClient } from '@/lib/queries/clients'
import { listClientTransactions } from '@/lib/queries/balance-transactions'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import { SocialHandleInput } from '@/components/ui/SocialHandleInput'
import { formatDateYY } from '@/lib/formatters'
import { transactionTypeLabel } from '@/lib/badges'
import { VM } from '@/lib/validation-messages'
import { MSG } from '@/lib/messages'
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

const clientSchema = z.object({
  first_name: z.string().min(1, VM.required.name),
  last_name: z.string().min(1, VM.required.lastName),
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
    const { data } = await listClientTransactions(supabase, client!.id, 20)
    setTransactions(data)
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
      const { data: phoneMatches } = await searchClientsByPhone(supabase, phone, isEdit ? client.id : undefined)
      if (phoneMatches.length > 0) {
        const c = phoneMatches[0]
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Невідомий клієнт'
        setError(`Клієнт з таким номером телефону вже існує: ${name}`)
        setLoading(false)
        return
      }
    }

    const { data: nameMatches } = await searchClientsByName(supabase, firstName, lastName, isEdit ? client.id : undefined)
    if (nameMatches.length > 0) {
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
      const { error: updateError } = await updateClient(supabase, client.id, payload)
      if (updateError) {
        setError(updateError)
        setLoading(false)
        return
      }
    } else {
      const { error: insertError } = await insertClient(supabase, payload)
      if (insertError) {
        setError(insertError)
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
        <ModalFooter
          onCancel={onClose}
          onSave={handleSubmit(onSubmit)}
          saveLabel={isEdit ? 'Оновити' : 'Зберегти'}
          loading={loading}
        />
      }
    >
      <div className={styles.row}>
        <FormField id="client-first-name" label="Ім'я" required error={errors.first_name}>
          <input
            id="client-first-name"
            type="text"
            {...register('first_name')}
            placeholder="Анна"
            disabled={loading}
          />
        </FormField>

        <FormField id="client-last-name" label="Прізвище" required error={errors.last_name}>
          <input
            id="client-last-name"
            type="text"
            {...register('last_name')}
            placeholder="Іваненко"
            disabled={loading}
          />
        </FormField>
      </div>

      <FormField id="client-phone" label="Телефон">
        <input
          id="client-phone"
          type="tel"
          {...register('phone')}
          placeholder="+380 XX XXX XX XX"
          disabled={loading}
        />
      </FormField>

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
                <p className={styles.historyEmpty}>{MSG.empty.transactions}</p>
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
                        <td className={styles.txDate}>{formatDateYY(tx.created_at)}</td>
                        <td className={styles.txType}>
                          {transactionTypeLabel(tx.transaction_type)}
                        </td>
                        {/* Голі числа без ₴ — навмисно (компактна таблиця транзакцій), не formatMoney */}
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
