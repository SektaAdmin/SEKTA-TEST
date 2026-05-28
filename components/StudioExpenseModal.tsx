'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import { insertStudioExpense } from '@/lib/queries/studio-expenses'
import { toYMD } from '@/lib/dateUtils'
import type { Trainer } from '@/types'
import styles from './StudioExpenseModal.module.css'

interface Props {
  trainers: Trainer[]
  onClose: () => void
  onSaved: () => void
}

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Готівка' },
  { value: 'fop',           label: 'ФОП' },
  { value: 'personal_card', label: 'Картка' },
] as const

export default function StudioExpenseModal({ trainers, onClose, onSaved }: Props) {
  const [direction, setDirection] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount]       = useState('')
  const [method, setMethod]       = useState<'cash' | 'fop' | 'personal_card'>('cash')
  const [trainerId, setTrainerId] = useState<string>('')
  const [description, setDescription] = useState('')
  const [date, setDate]           = useState(toYMD(new Date()))
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleSubmit() {
    const amt = parseInt(amount, 10)
    if (!amount || isNaN(amt) || amt <= 0) {
      setError('Введіть суму більше 0')
      return
    }

    setSaving(true)
    setError(null)

    const { success, error: dbError } = await insertStudioExpense(supabase, {
      amount: amt,
      direction,
      payment_method: method,
      trainer_id: trainerId || null,
      description: description.trim() || null,
      created_at: `${date}T12:00:00`,
    })

    if (!success) {
      setError(dbError ?? 'Помилка збереження')
      setSaving(false)
      return
    }

    toast.success(direction === 'expense' ? 'Витрату записано' : 'Дохід записано')
    onSaved()
  }

  return (
    <ModalShell
      title="Студійна операція"
      onClose={onClose}
      width={420}
      footer={<ModalFooter onCancel={onClose} onSave={handleSubmit} loading={saving} />}
    >
      {/* Direction toggle */}
      <div className={styles.directionRow}>
        <button
          type="button"
          className={`${styles.dirBtn} ${direction === 'expense' ? styles.dirBtnExpense : ''}`}
          onClick={() => setDirection('expense')}
        >
          Витрата
        </button>
        <button
          type="button"
          className={`${styles.dirBtn} ${direction === 'income' ? styles.dirBtnIncome : ''}`}
          onClick={() => setDirection('income')}
        >
          Дохід
        </button>
      </div>

      <FormField id="se-amount" label="Сума (₴)" required>
        <input
          id="se-amount"
          type="number"
          min="1"
          placeholder="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          autoFocus
        />
      </FormField>

      <FormField id="se-method" label="Метод оплати" required>
        <select
          id="se-method"
          value={method}
          onChange={e => setMethod(e.target.value as typeof method)}
        >
          {PAYMENT_METHODS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </FormField>

      <FormField id="se-trainer" label="Тренер">
        <select
          id="se-trainer"
          value={trainerId}
          onChange={e => setTrainerId(e.target.value)}
        >
          <option value="">— без тренера —</option>
          {trainers.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </FormField>

      <FormField id="se-description" label="Коментар">
        <textarea
          id="se-description"
          placeholder="Вода, канцелярія, оренда..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
        />
      </FormField>

      <FormField id="se-date" label="Дата" required>
        <input
          id="se-date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </FormField>

      {error && <div className={styles.error}>{error}</div>}
    </ModalShell>
  )
}
