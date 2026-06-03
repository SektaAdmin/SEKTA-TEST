'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { insertTrainer, updateTrainer } from '@/lib/queries/trainers'
import { createTrainerLogin } from '@/lib/queries/trainer-login'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import { SocialHandleInput } from '@/components/ui/SocialHandleInput'
import { VM } from '@/lib/validation-messages'
import { MSG } from '@/lib/messages'
import type { Trainer } from '@/types'
import styles from './TrainerModal.module.css'


interface TrainerFormValues {
  name: string
  phone: string
  email: string
  instagram_username: string
  telegram_username: string
}

interface Props {
  /** Якщо задано — режим редагування; інакше — створення. */
  existing?: Trainer | null
  onClose: () => void
  onSaved: () => void
}

export default function TrainerModal({ existing, onClose, onSaved }: Props) {
  const isEdit = !!existing
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  // Кабінет (логін) — лише в режимі редагування наявного тренера.
  const [hasCabinet, setHasCabinet] = useState(!!existing?.user_id)
  const [creatingLogin, setCreatingLogin] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [createdCreds, setCreatedCreds] = useState<{ login: string; password: string; reset: boolean } | null>(null)
  const [credsCopied, setCredsCopied] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrainerFormValues>({
    defaultValues: {
      name: existing?.name ?? '',
      phone: existing?.phone ?? '',
      email: existing?.email ?? '',
      instagram_username: existing?.instagram_username ?? '',
      telegram_username: existing?.telegram_username ?? '',
    },
  })

  const onSubmit = async (data: TrainerFormValues) => {
    setLoading(true)
    setServerError('')

    const payload = {
      name: data.name.trim(),
      phone: data.phone.trim() || null,
      email: data.email.trim() || null,
      instagram_username: data.instagram_username.trim() || null,
      telegram_username: data.telegram_username.trim() || null,
    }

    const { error } = isEdit
      ? await updateTrainer(supabase, existing!.id, payload)
      : await insertTrainer(supabase, { ...payload, is_active: true })

    if (error) {
      setServerError(error)
      setLoading(false)
      return
    }

    onSaved()
  }

  async function handleCreateLogin() {
    if (!existing) return
    setCreatingLogin(true)
    setLoginError('')
    const { login, password, reset, error } = await createTrainerLogin(existing.id)
    setCreatingLogin(false)
    if (error || !login || !password) {
      setLoginError(error ?? 'Помилка створення кабінету')
      return
    }
    setHasCabinet(true)
    setCredsCopied(false)
    setCreatedCreds({ login, password, reset })
  }

  function credsText() {
    if (!createdCreds) return ''
    return `Вхід у кабінет студії:\nЛогін: ${createdCreds.login}\nПароль: ${createdCreds.password}\n\nРекомендуємо змінити пароль після входу.`
  }

  async function copyCreds() {
    try {
      await navigator.clipboard.writeText(credsText())
      setCredsCopied(true)
    } catch {
      toast.error(MSG.toast.copyFailed)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Редагувати тренера' : 'Новий тренер'}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSave={handleSubmit(onSubmit)}
          loading={loading}
        />
      }
    >
      <FormField id="trainer-name" label="Ім'я" required error={errors.name}>
        <input
          id="trainer-name"
          type="text"
          {...register('name', { required: VM.required.name })}
          placeholder="Ім'я тренера"
          disabled={loading}
        />
      </FormField>

      <FormField id="trainer-phone" label="Телефон">
        <input
          id="trainer-phone"
          type="tel"
          inputMode="tel"
          {...register('phone')}
          placeholder="+380…"
          disabled={loading}
        />
      </FormField>

      <FormField id="trainer-email" label="Email">
        <input
          id="trainer-email"
          type="email"
          inputMode="email"
          {...register('email')}
          placeholder="trainer@example.com"
          disabled={loading}
        />
      </FormField>

      <SocialHandleInput
        id="trainer-instagram"
        label="Instagram"
        registration={register('instagram_username')}
        disabled={loading}
      />

      <SocialHandleInput
        id="trainer-telegram"
        label="Telegram"
        registration={register('telegram_username')}
        disabled={loading}
      />

      {serverError && <p className={styles.error} role="alert">{serverError}</p>}

      {isEdit && (
        <div className={styles.cabinet}>
          <span className={styles.cabinetLabel}>Кабінет тренера</span>
          {hasCabinet && !createdCreds ? (
            <>
              <span className="badge badge-completed">Кабінет активний</span>
              <p className={styles.cabinetHint}>
                Пароль не зберігається — якщо тренер його загубив, згенеруйте новий.
              </p>
              {loginError && <p className={styles.error} role="alert">{loginError}</p>}
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreateLogin}
                disabled={creatingLogin}
              >
                {creatingLogin ? 'Скидання…' : 'Скинути пароль'}
              </button>
            </>
          ) : createdCreds ? (
            <>
              <p className={styles.cabinetHint}>
                {createdCreds.reset ? 'Новий пароль — надішліть тренеру:' : 'Надішліть ці дані тренеру:'}
              </p>
              <pre className={styles.creds}>{credsText()}</pre>
              <button type="button" className="btn-primary" onClick={copyCreds}>
                {credsCopied ? 'Скопійовано ✓' : 'Скопіювати'}
              </button>
            </>
          ) : !existing.phone && !existing.email ? (
            <p className={styles.cabinetHint}>
              Додайте телефон або email і збережіть — тоді зможете створити кабінет.
            </p>
          ) : (
            <>
              <p className={styles.cabinetHint}>
                Тренер заходитиме за {existing.phone ? `номером ${existing.phone}` : `email ${existing.email}`}.
                Логін і пароль зʼявляться після створення — надішліть їх тренеру.
              </p>
              {loginError && <p className={styles.error} role="alert">{loginError}</p>}
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreateLogin}
                disabled={creatingLogin}
              >
                {creatingLogin ? 'Створення…' : 'Створити кабінет'}
              </button>
            </>
          )}
        </div>
      )}
    </ModalShell>
  )
}
