'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import styles from './HallModal.module.css'

const supabase = createClient()

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
      setError('Введіть назву залу')
      return
    }
    if (!capacity || Number(capacity) <= 0) {
      setError('Введіть коректну місткість')
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
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Новий зал</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Закрити">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
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
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={saving}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  )
}
