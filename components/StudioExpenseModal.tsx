'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import { insertStudioExpense, updateStudioExpense } from '@/lib/queries/studio-expenses'
import type { StudioExpense } from '@/lib/queries/studio-expenses'
import { toYMD, isoToYMD } from '@/lib/dateUtils'
import type { Trainer } from '@/types'
import styles from './StudioExpenseModal.module.css'

interface Props {
  trainers: Trainer[]
  onClose: () => void
  onSaved: () => void
  editExpense?: StudioExpense
}

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Готівка' },
  { value: 'fop',           label: 'ФОП' },
  { value: 'personal_card', label: 'Картка' },
] as const

type Mode = 'expense' | 'income' | 'transfer'

function detectMode(e: StudioExpense): Mode {
  const desc = e.description ?? ''
  if (desc.startsWith('Переказ →') || desc.startsWith('Переказ ←')) return 'transfer'
  return e.direction
}

export default function StudioExpenseModal({ trainers, onClose, onSaved, editExpense }: Props) {
  const isEdit = !!editExpense

  const [mode, setMode] = useState<Mode>(() => isEdit ? detectMode(editExpense!) : 'expense')
  const [amount, setAmount] = useState(() => isEdit ? String(editExpense!.amount) : '')
  const [method, setMethod] = useState<'cash' | 'fop' | 'personal_card'>(() =>
    isEdit ? editExpense!.payment_method : 'cash'
  )
  const [trainerId, setTrainerId] = useState<string>(() =>
    isEdit ? (editExpense!.trainer_id ?? '') : ''
  )
  const [fromTrainerId, setFromTrainerId] = useState<string>('')
  const [toTrainerId, setToTrainerId] = useState<string>('')
  const [description, setDescription] = useState(() => {
    if (!isEdit) return ''
    const desc = editExpense!.description ?? ''
    // strip transfer prefix for display
    return desc.replace(/^Переказ [→←] [^·]+( · )?/, '') ?? desc
  })
  const [date, setDate] = useState(() =>
    isEdit ? isoToYMD(editExpense!.created_at) : toYMD(new Date())
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeTrainers = trainers.filter(t => t.is_active)

  async function handleSubmit() {
    const amt = parseInt(amount, 10)
    if (!amount || isNaN(amt) || amt <= 0) { setError('Введіть суму більше 0'); return }

    if (mode === 'transfer') {
      if (!fromTrainerId) { setError('Оберіть від кого'); return }
      if (!toTrainerId)   { setError('Оберіть кому'); return }
      if (fromTrainerId === toTrainerId) { setError('Відправник і отримувач співпадають'); return }

      setSaving(true)
      setError(null)

      const fromName = activeTrainers.find(t => t.id === fromTrainerId)?.name ?? ''
      const toName   = activeTrainers.find(t => t.id === toTrainerId)?.name ?? ''
      const note     = description.trim()
      const ts       = `${date}T12:00:00`

      const [res1, res2] = await Promise.all([
        insertStudioExpense(supabase, {
          amount: amt, direction: 'expense', payment_method: 'cash',
          trainer_id: null, cash_holder: fromTrainerId,
          description: `Переказ → ${toName}${note ? ` · ${note}` : ''}`,
          created_at: ts,
        }),
        insertStudioExpense(supabase, {
          amount: amt, direction: 'income', payment_method: 'cash',
          trainer_id: null, cash_holder: toTrainerId,
          description: `Переказ ← ${fromName}${note ? ` · ${note}` : ''}`,
          created_at: ts,
        }),
      ])

      if (!res1.success || !res2.success) {
        setError(res1.error ?? res2.error ?? 'Помилка збереження')
        setSaving(false)
        return
      }

      toast.success('Переказ зафіксовано')
      onSaved()
      return
    }

    setSaving(true)
    setError(null)

    const params = {
      amount: amt,
      direction: mode,
      payment_method: method,
      trainer_id: trainerId || null,
      cash_holder: method === 'cash' ? (trainerId || null) : null,
      description: description.trim() || null,
      created_at: `${date}T12:00:00`,
    }

    const result = isEdit
      ? await updateStudioExpense(supabase, editExpense!.id, params)
      : await insertStudioExpense(supabase, params)

    if (!result.success) {
      setError(result.error ?? 'Помилка збереження')
      setSaving(false)
      return
    }

    toast.success(isEdit ? 'Збережено' : mode === 'expense' ? 'Витрату записано' : 'Дохід записано')
    onSaved()
  }

  return (
    <ModalShell
      title={isEdit ? 'Редагування операції' : 'Студійна операція'}
      onClose={onClose}
      width={420}
      footer={<ModalFooter onCancel={onClose} onSave={handleSubmit} loading={saving} />}
    >
      {/* Mode toggle — hidden in edit mode for transfer (complex to re-edit) */}
      {!(isEdit && mode === 'transfer') && (
        <div className={styles.directionRow}>
          <button type="button"
            className={`${styles.dirBtn} ${mode === 'expense'  ? styles.dirBtnExpense  : ''}`}
            onClick={() => setMode('expense')}>Витрата</button>
          <button type="button"
            className={`${styles.dirBtn} ${mode === 'income'   ? styles.dirBtnIncome   : ''}`}
            onClick={() => setMode('income')}>Дохід</button>
          {!isEdit && (
            <button type="button"
              className={`${styles.dirBtn} ${mode === 'transfer' ? styles.dirBtnTransfer : ''}`}
              onClick={() => setMode('transfer')}>Переказ</button>
          )}
        </div>
      )}

      {mode === 'transfer' ? (
        <>
          <FormField id="se-date" label="Дата" required>
            <input id="se-date" type="date" value={date}
              onChange={e => setDate(e.target.value)} autoFocus />
          </FormField>

          <FormField id="se-amount" label="Сума (₴)" required>
            <input id="se-amount" type="number" min="1" placeholder="0"
              value={amount} onChange={e => setAmount(e.target.value)} />
          </FormField>

          <FormField id="se-from" label="Від" required>
            <select id="se-from" value={fromTrainerId}
              onChange={e => setFromTrainerId(e.target.value)}>
              <option value="">— Оберіть —</option>
              {activeTrainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </FormField>

          <FormField id="se-to" label="До" required>
            <select id="se-to" value={toTrainerId}
              onChange={e => setToTrainerId(e.target.value)}>
              <option value="">— Оберіть —</option>
              {activeTrainers.filter(t => t.id !== fromTrainerId).map(t =>
                <option key={t.id} value={t.id}>{t.name}</option>
              )}
            </select>
          </FormField>

          <FormField id="se-description" label="Примітка">
            <input id="se-description" type="text" placeholder="травень 2026"
              value={description} onChange={e => setDescription(e.target.value)} />
          </FormField>
        </>
      ) : (
        <>
          <FormField id="se-date" label="Дата" required>
            <input id="se-date" type="date" value={date}
              onChange={e => setDate(e.target.value)} autoFocus />
          </FormField>

          <FormField id="se-amount" label="Сума (₴)" required>
            <input id="se-amount" type="number" min="1" placeholder="0"
              value={amount} onChange={e => setAmount(e.target.value)} />
          </FormField>

          <FormField id="se-method" label="Метод оплати" required>
            <select id="se-method" value={method}
              onChange={e => {
                const v = e.target.value as typeof method
                setMethod(v)
                if (v !== 'cash') setTrainerId('')
              }}>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </FormField>

          <FormField id="se-trainer" label="Тренер">
            <select id="se-trainer" value={trainerId}
              onChange={e => setTrainerId(e.target.value)}
              disabled={method !== 'cash'}>
              <option value="">— без тренера —</option>
              {activeTrainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </FormField>

          <FormField id="se-description" label="Коментар">
            <textarea id="se-description" placeholder="Вода, канцелярія, оренда..."
              value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </FormField>
        </>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </ModalShell>
  )
}
