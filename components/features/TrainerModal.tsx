'use client'
import { useState, useId } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import Button from '@/components/ui/Button'

const supabase = createClient()

const inputCls = 'w-full px-3 py-2 bg-[var(--bg)] border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text)] text-[13px] outline-none transition-colors duration-150 placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:opacity-50'
const labelCls = 'text-[12px] font-medium text-[var(--text-2)]'
const errorHintCls = 'text-[11px] text-[var(--danger)] mt-0.5'

interface TrainerFormValues {
  name: string
  instagram_username: string
  telegram_username: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function TrainerModal({ onClose, onSaved }: Props) {
  const titleId = useId()
  const modalRef = useModalFocus(onClose)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<TrainerFormValues>({
    defaultValues: { name: '', instagram_username: '', telegram_username: '' },
  })

  const onSubmit = async (data: TrainerFormValues) => {
    setLoading(true)
    setServerError('')
    const { error: insertError } = await supabase.from('trainers').insert({
      name: data.name.trim(),
      instagram_username: data.instagram_username.trim() || null,
      telegram_username: data.telegram_username.trim() || null,
      is_active: true,
    })
    if (insertError) { setServerError(insertError.message); setLoading(false); return }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className="flex flex-col w-[380px] max-h-[90vh] bg-[var(--bg-2)] border border-[0.5px] border-[var(--border-hover)] rounded-[var(--radius)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between px-5 py-[18px] border-b border-[0.5px] border-[var(--border)]">
          <h2 id={titleId} className="text-[15px] font-semibold text-[var(--text)] m-0">Новий тренер</h2>
          <button onClick={onClose} aria-label="Закрити" className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors text-[16px] leading-none cursor-pointer bg-transparent border-none">✕</button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="trainer-name" className={labelCls}>Ім&apos;я <span className="text-[var(--danger)]">*</span></label>
            <input id="trainer-name" type="text" className={inputCls} {...register('name', { required: "Ім'я обов'язкове" })} placeholder="Ім'я тренера" disabled={loading} />
            {errors.name && <p className={errorHintCls} role="alert">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="trainer-instagram" className={labelCls}>Instagram</label>
            <div className="flex items-center">
              <span className="px-3 py-2 bg-[var(--bg-3)] border border-[0.5px] border-r-0 border-[var(--border)] rounded-l-[var(--radius-sm)] text-[var(--text-3)] text-[13px]">@</span>
              <input id="trainer-instagram" type="text" className={`${inputCls} rounded-l-none`} {...register('instagram_username')} placeholder="username" disabled={loading} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="trainer-telegram" className={labelCls}>Telegram</label>
            <div className="flex items-center">
              <span className="px-3 py-2 bg-[var(--bg-3)] border border-[0.5px] border-r-0 border-[var(--border)] rounded-l-[var(--radius-sm)] text-[var(--text-3)] text-[13px]">@</span>
              <input id="trainer-telegram" type="text" className={`${inputCls} rounded-l-none`} {...register('telegram_username')} placeholder="username" disabled={loading} />
            </div>
          </div>

          {serverError && <p className="text-[12px] text-[var(--danger)] bg-[var(--danger-dim)] px-3 py-2 rounded-[var(--radius-sm)]" role="alert">{serverError}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[0.5px] border-[var(--border)]">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Скасувати</Button>
          <Button variant="primary" onClick={handleSubmit(onSubmit)} loading={loading}>Зберегти</Button>
        </div>
      </div>
    </div>
  )
}
