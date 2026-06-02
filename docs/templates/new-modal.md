# Шаблон: нова форм-модалка

Копіюй **TrainerModal** — НЕ SaleModal (там спец-логіка `useSaleForm`/`useSaleSubmit`).

## Готовий TSX-скелет (замінити «Приклад»)

```tsx
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import { VM } from '@/lib/validation-messages'
import styles from './PrykladModal.module.css'

// ── Типи ────────────────────────────────────────────────────────────────────

interface PrykladFormValues {
  title: string        // обов'язкове
  description: string  // необов'язкове
}

// Якщо модалка і додає, і редагує — додай `existing?: Pryklad | null`
interface Props {
  onClose: () => void
  onSaved: () => void
}

// ── Компонент ────────────────────────────────────────────────────────────────

export default function PrykladModal({ onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PrykladFormValues>({
    defaultValues: { title: '', description: '' },
    // Якщо редагування: defaultValues: existing ? { title: existing.title, ... } : { ... }
  })

  const onSubmit = async (data: PrykladFormValues) => {
    setLoading(true)
    setServerError('')

    // INSERT через lib/queries/<entity>.ts або напряму суpabase.from() для простого INSERT.
    // Складна бізнес-логіка → callRpc() з lib/rpc.ts (дивись нижче).
    const { error } = await supabase.from('pryklad').insert({
      title: data.title.trim(),
      description: data.description.trim() || null,
      is_active: true,
    })

    if (error) {
      setServerError(error.message)
      setLoading(false)
      return
    }

    onSaved()  // батьківський onSaved закриває модалку і робить refetch
  }

  return (
    <ModalShell
      title="Новий запис"  // або «Редагувати запис» при existing
      onClose={onClose}
      // size не вказуємо — дефолт 'form' (440px). 'detail' (760px) лише для перегляду деталей.
      footer={
        <ModalFooter
          onCancel={onClose}
          onSave={handleSubmit(onSubmit)}
          loading={loading}
          // saveLabel="Зберегти"  ← дефолт; міняй лише при потребі
        />
      }
    >
      {/* Поле 1 — обов'язкове */}
      <FormField
        id="pryklad-title"
        label="Назва"
        required
        error={errors.title}
      >
        <input
          id="pryklad-title"
          type="text"
          {...register('title', { required: VM.required.title })}
          placeholder="Введіть назву"
          disabled={loading}
        />
      </FormField>

      {/* Поле 2 — необов'язкове (без required і без error-prop) */}
      <FormField
        id="pryklad-description"
        label="Опис"
      >
        <input
          id="pryklad-description"
          type="text"
          {...register('description')}
          placeholder="Необов'язково"
          disabled={loading}
        />
      </FormField>

      {/* Серверна помилка — завжди внизу форми */}
      {serverError && <p className={styles.error} role="alert">{serverError}</p>}
    </ModalShell>
  )
}
```

## CSS-модуль (`PrykladModal.module.css`)

Мінімальний — тільки `.error` (як у TrainerModal.module.css):

```css
.error {
  font-size: 14px;
  color: var(--danger);
  background: var(--danger-dim);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  line-height: 1.4;
}
```

Якщо є специфічний layout — додавай тут через `var()`-токени (`globals.css`), ніяких HEX/rgba.

## Чеклист

- `register('field', { required: VM.required.* })` — правила валідації тільки з `VM`; нові ключі — в `lib/validation-messages.ts`.
- `error={errors.field}` у `FormField` — хук RHF, `FormField` сам відмальовує текст помилки.
- `onSaved()` викликається **після** успішного INSERT/UPDATE, без аргументів — батьківський `RefEntityPage.onSaved` сам закриє та зробить `refetch()`.
- INSERT/UPDATE → через функції у `lib/queries/<entity>.ts` (не inline `.from()` у модалці, якщо логіка > 1 рядка).
- RPC-виклики → `callRpc()` з `lib/rpc.ts`; розпаковуй `success`/`error_message`; вкладай помилку у `setServerError`.
- При редагуванні — прийми `existing?: Entity | null`; заповни `defaultValues` з `existing`; у `onSubmit` — `supabase.from(...).update(...).eq('id', existing.id)`.
- `ModalShell.footer` — завжди `<ModalFooter …/>`. Якщо кнопка «Зберегти» не потрібна — передай `onSave` без значення (кнопка не рендериться).
- Не додавай `onClose()` в `onSaved()` — `RefEntityPage` сам закриває.
