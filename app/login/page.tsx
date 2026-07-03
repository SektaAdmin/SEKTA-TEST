'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FormField } from '@/components/ui/FormField'
import styles from './login.module.css'

/**
 * Привести укр. номер до E.164 (+380XXXXXXXXX) — той самий формат, що в auth.users.phone
 * (його туди кладе normalize_phone_ua у Route Handler онбордингу). Дзеркало тієї логіки на клієнті.
 * Якщо формат не вгадується — повертаємо як є, хай Supabase відмовить (покажемо «невірний логін»).
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length === 10 && digits.startsWith('0')) return '+38' + digits // 0XXXXXXXXX
  if (digits.length === 12 && digits.startsWith('380')) return '+' + digits // 380XXXXXXXXX
  if (raw.trim().startsWith('+')) return '+' + digits // вже E.164
  return raw.trim()
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    // Персонал логіниться по email, клієнт — по телефону (E.164 +380…).
    // Розводимо за наявністю '@': є → email, інакше → нормалізований телефон.
    const value = identifier.trim()
    const isEmail = value.includes('@')
    const credentials = isEmail
      ? { email: value, password }
      : { phone: normalizePhone(value), password }
    const { error } = await supabase.auth.signInWithPassword(credentials)
    if (error) {
      setError('Невірний логін або пароль')
      setLoading(false)
    } else {
      // Редирект у домашню зону ролі робить middleware (корінь → home за роллю).
      window.location.href = '/'
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>SEKTA</div>
        <p className={styles.sub}>CRM система</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <FormField id="login-identifier" label="Email або телефон">
            <input
              id="login-identifier"
              type="text"
              inputMode="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="+380…"
              required
              autoComplete="username"
            />
          </FormField>
          <FormField id="login-password" label="Пароль">
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </FormField>
          {error && <p className={styles.error}>{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Вхід...' : 'Увійти'}
          </button>
        </form>
      </div>
    </div>
  )
}
