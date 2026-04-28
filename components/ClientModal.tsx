'use client'
import { useState, useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import type { Client } from '@/types'
import styles from './ClientModal.module.css'

const supabase = createClient()

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
  const titleId = useId()
  const modalRef = useModalFocus(onClose)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

    // Check phone duplicate (exclude current client when editing)
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

    // Check full name duplicate (case-insensitive, exclude current client when editing)
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
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId}>{isEdit ? 'Редагувати клієнта' : 'Новий клієнт'}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <div className={styles.body}>

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

          <div className={styles.field}>
            <label htmlFor="client-instagram">Instagram</label>
            <div className={styles.inputPrefix}>
              <span className={styles.prefix}>@</span>
              <input
                id="client-instagram"
                type="text"
                {...register('instagram_username')}
                placeholder="username"
                disabled={loading}
                className={styles.inputWithPrefix}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="client-telegram">Telegram</label>
            <div className={styles.inputPrefix}>
              <span className={styles.prefix}>@</span>
              <input
                id="client-telegram"
                type="text"
                {...register('telegram_username')}
                placeholder="username"
                disabled={loading}
                className={styles.inputWithPrefix}
              />
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? 'Збереження...' : isEdit ? 'Оновити' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  )
}
