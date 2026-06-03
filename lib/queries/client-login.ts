// Фаза 5: створення кабінету клієнту.
// Викликає серверний Route Handler (admin.createUser потребує service-role,
// якого не можна світити в браузер). Формат відповіді — як у решти queries.

const ERROR_LABELS: Record<string, string> = {
  no_phone: 'У клієнта немає коректного номера телефону',
  already_linked: 'У клієнта вже є кабінет',
  phone_taken: 'Цей номер уже привʼязаний до іншого кабінету',
  client_not_found: 'Клієнта не знайдено',
  forbidden: 'Недостатньо прав',
}

/**
 * Створити кабінет клієнту АБО скинути пароль наявному (якщо user_id вже є —
 * сервер генерує новий пароль; старий ніде не зберігається, показати неможливо).
 * `reset` у відповіді = чи це було скидання (для адаптації тексту в UI).
 */
export async function createClientLogin(
  clientId: string
): Promise<{ login: string | null; password: string | null; reset: boolean; error: string | null }> {
  try {
    const res = await fetch('/api/admin/create-client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const code = typeof json.error === 'string' ? json.error : ''
      return { login: null, password: null, reset: false, error: ERROR_LABELS[code] ?? (code || 'Помилка створення кабінету') }
    }
    return { login: json.login ?? null, password: json.password ?? null, reset: !!json.reset, error: null }
  } catch {
    return { login: null, password: null, reset: false, error: 'Помилка зʼєднання' }
  }
}
