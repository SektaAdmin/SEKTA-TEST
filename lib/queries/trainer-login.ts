// Створення кабінету тренеру (логіну).
// Викликає серверний Route Handler (admin.createUser потребує service-role,
// якого не можна світити в браузер). Формат відповіді — як у решти queries.

const ERROR_LABELS: Record<string, string> = {
  no_contact: 'У тренера немає телефону чи email',
  bad_phone: 'Некоректний номер телефону тренера',
  already_linked: 'У тренера вже є кабінет',
  contact_taken: 'Цей контакт уже привʼязаний до іншого кабінету',
  trainer_not_found: 'Тренера не знайдено',
  forbidden: 'Недостатньо прав',
}

/**
 * Створити кабінет тренеру АБО скинути пароль наявному (якщо user_id вже є —
 * сервер генерує новий пароль; старий ніде не зберігається, показати неможливо).
 * `reset` у відповіді = чи це було скидання (для адаптації тексту в UI).
 */
export async function createTrainerLogin(
  trainerId: string
): Promise<{ login: string | null; password: string | null; reset: boolean; error: string | null }> {
  try {
    const res = await fetch('/api/admin/create-trainer-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainer_id: trainerId }),
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
