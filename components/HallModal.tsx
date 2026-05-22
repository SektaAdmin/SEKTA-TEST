'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { VM } from '@/lib/validation-messages'
import styles from './HallModal.module.css'


interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function HallModal({ onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) {
      setError(VM.required.hallName)
      return
    }
    if (!capacity || Number(capacity) <= 0) {
      setError(VM.invalid.capacityPositive)
      return
    }

    setSaving(true)
    setError(null)

    const { error: dbError } = await supabase.from('halls').insert({
      name: name.trim(),
      capacity: Number(capacity),
      description: description.trim() || null,
      is_active: true,
    })

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    onSaved()
  }

  return (
    <ModalShell
      title="Новий зал"
      onClose={onClose}
      width={440}
      modalClassName={styles.modal}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSave={handleSubmit}
          loading={saving}
        />
      }
    >
      <div className={styles.field}>
        <label className={styles.label}>Назва залу *</label>
        <input
          className={styles.input}
          type="text"
          placeholder="Наприклад: Великий зал"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Місткість (осіб) *</label>
        <input
          className={styles.input}
          type="number"
          min="1"
          placeholder="Наприклад: 20"
          value={capacity}
          onChange={e => setCapacity(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Опис</label>
        <textarea
          className={styles.textarea}
          placeholder="Необов'язково"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}
    </ModalShell>
  )
}
