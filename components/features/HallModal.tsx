'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const supabase = createClient()

const inputCls = 'w-full px-3 py-2 bg-[var(--bg)] border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text)] text-[13px] outline-none transition-colors duration-150 placeholder:text-[var(--text-3)] focus:border-[var(--accent)]'
const labelCls = 'text-[11px] font-medium text-[var(--text-2)] uppercase tracking-[0.06em]'

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
    if (!name.trim()) { setError('Введіть назву залу'); return }
    if (!capacity || Number(capacity) <= 0) { setError('Введіть коректну місткість'); return }

    setSaving(true)
    setError(null)

    const { error: dbError } = await supabase.from('halls').insert({
      name: name.trim(),
      capacity: Number(capacity),
      description: description.trim() || null,
      is_active: true,
    })

    if (dbError) { setError(dbError.message); setSaving(false); return }
    onSaved()
  }

  return (
    <Modal onClose={onClose} title="Новий зал">
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Назва залу *</label>
          <input className={inputCls} type="text" placeholder="Наприклад: Великий зал" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Місткість (осіб) *</label>
          <input className={inputCls} type="number" min="1" placeholder="Наприклад: 20" value={capacity} onChange={e => setCapacity(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>Опис</label>
          <textarea className={`${inputCls} resize-y font-[var(--font)] leading-relaxed`} placeholder="Необов'язково" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
        </div>

        {error && (
          <div className="text-[12px] text-[var(--danger)] px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--danger-dim)] border border-[0.5px] border-[rgba(255,92,92,0.25)]">
            {error}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 px-6 pb-5">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Скасувати</Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving}>Зберегти</Button>
      </div>
    </Modal>
  )
}
