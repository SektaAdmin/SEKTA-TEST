'use client'
import { useState, useId } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import Button from '@/components/ui/Button'
import type { TrainingType } from '@/types'

const supabase = createClient()

const inputCls = 'w-full px-3 py-2 bg-[var(--bg-3)] border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text)] text-[13px] font-[var(--font)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:opacity-50'
const labelCls = 'text-[11px] text-[var(--text-2)] uppercase tracking-[0.04em]'
const errorHintCls = 'text-[11px] text-[var(--danger)] mt-0.5'

interface FormValues {
  code: string
  label: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
  existing?: TrainingType | null
}

export default function TrainingTypeModal({ onClose, onSaved, existing }: Props) {
  const titleId = useId()
  const modalRef = useModalFocus(onClose)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: existing ? { code: existing.code, label: existing.label } : { code: '', label: '' },
  })

  const onSubmit = async (data: FormValues) => {
    setLoading(true)
    setServerError('')
    if (existing) {
      const { error } = await supabase.from('training_types').update({ label: data.label.trim() }).eq('id', existing.id)
      if (error) { setServerError(error.message); setLoading(false); return }
    } else {
      const { error } = await supabase.from('training_types').insert({ code: data.code.trim(), label: data.label.trim() })
      if (error) { setServerError(error.message); setLoading(false); return }
    }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
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
          <h2 id={titleId} className="text-[14px] font-medium text-[var(--text)] m-0">
            {existing ? 'Редагування типу' : 'Новий тип тренування'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрити" className="border-none bg-transparent text-[var(--text-3)] cursor-pointer text-[14px] leading-none p-[2px] transition-colors duration-[120ms] hover:text-[var(--text)]">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tt-code" className={labelCls}>Код <span className="text-[var(--danger)]">*</span></label>
              <input
                id="tt-code" type="text" className={inputCls}
                {...register('code', {
                  required: "Код обов'язковий",
                  pattern: { value: /^[a-z0-9]+$/, message: 'Тільки малі латинські букви та цифри' },
                })}
                placeholder="group"
                disabled={loading || !!existing}
              />
              {errors.code && <p className={errorHintCls} role="alert">{errors.code.message}</p>}
              {!existing && (
                <span className="text-[11px] text-[var(--text-3)]">
                  Незмінний ідентифікатор. Використовується в абонементах і розкладі.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tt-label" className={labelCls}>Назва <span className="text-[var(--danger)]">*</span></label>
              <input id="tt-label" type="text" className={inputCls} {...register('label', { required: "Назва обов'язкова" })} placeholder="Групові" disabled={loading} />
              {errors.label && <p className={errorHintCls} role="alert">{errors.label.message}</p>}
            </div>

            {serverError && <p className="text-[12px] text-[var(--danger)] bg-[var(--danger-dim)] px-3 py-2 rounded-[var(--radius-sm)]" role="alert">{serverError}</p>}
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-[0.5px] border-[var(--border)]">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Скасувати</Button>
            <Button type="submit" variant="primary" loading={loading}>Зберегти</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
