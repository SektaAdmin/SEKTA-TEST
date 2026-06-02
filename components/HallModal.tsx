'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { insertHall } from '@/lib/queries/halls'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
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

    const { error: dbError } = await insertHall(supabase, {
      name: name.trim(),
      capacity: Number(capacity),
      description: description.trim() || null,
      is_active: true,
    })

    if (dbError) {
      setError(dbError)
      setSaving(false)
      return
    }

    onSaved()
  }

  return (
    <ModalShell
      title="Новий зал"
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSave={handleSubmit}
          loading={saving}
        />
      }
    >
      <FormField id="hall-name" label="Назва залу" required>
        <input
          id="hall-name"
          type="text"
          placeholder="Наприклад: Великий зал"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
      </FormField>

      <FormField id="hall-capacity" label="Місткість (осіб)" required>
        <input
          id="hall-capacity"
          type="number"
          min="1"
          placeholder="Наприклад: 20"
          value={capacity}
          onChange={e => setCapacity(e.target.value)}
        />
      </FormField>

      <FormField id="hall-description" label="Опис">
        <textarea
          id="hall-description"
          placeholder="Необов'язково"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />
      </FormField>

      {error && <div className={styles.error}>{error}</div>}
    </ModalShell>
  )
}
