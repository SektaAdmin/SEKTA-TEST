export const MSG = {
  empty: {
    clients:            'Клієнтів ще немає',
    sales:              'Продажів ще немає',
    salesFiltered:      'За вашим фільтром нічого не знайдено',
    trainerSales:       'Немає продажів з тренером за цей період',
    activeEnrollments:  'Немає активних занять',
    permanentRecords:   'Немає постійних записів',
    futureEnrollments:  'Немає майбутніх записів',
    bookableClasses:    'Немає занять на найближчий місяць',
    transactions:       'Транзакцій немає',
    purchases:          'Покупок ще немає',
    pastEnrollments:    'Минулих записів немає',
    seriesClients:      'Немає постійників',
    salesPeriod:        'За цей період продажів немає',
    operations:         'За цей період операцій немає',
    salaryPeriod:       'Проведених занять за цей місяць немає',
    paymentsPeriod:     'Виплат за цей місяць немає',
    scheduleCancelled:  'Скасованих занять за цей період немає',
    enrollments:        'Нікого не записано',
    events:             'Ще немає подій',
    tickets:            'Активних абонементів немає',
    trainers:           'Активних тренерів немає',
    halls:              'Активних залів немає',
    trainingTypes:      'Активних типів немає',
    journalEmpty:       'Занять за цей період не знайдено',
    rates:              'Ставок немає. Додайте першу ставку.',
    salaryClasses:      'Занять з нарахуваннями немає за вказаний період',
    salaryPayments:     'Виплат за цей період немає',
  },
  toast: {
    saved:              'Збережено',
    copied:             'Скопійовано',
    copyFailed:         'Не вдалося скопіювати',
    deleteFailed:       'Помилка видалення',
  },
  error: {
    feedLoad:           'Не вдалося завантажити список. Перевірте з’єднання і спробуйте ще раз.',
  },
} as const

// RPC-функції (delete_sale, update_client_balance) повертають error_message вже
// українською — ці рядки показуються як є. Усе інше (мережева помилка, обрив
// з'єднання, сирий текст PostgREST) — непередбачений випадок, підмінюємо на
// зрозуміле формулювання замість сирого тексту в UI.
const KNOWN_RPC_ERRORS = new Set([
  'Продажу не знайдено',
  'Клієнта не знайдено',
  'Перевищено ліміт кредиту',
])

/** Повертає error як є, якщо це відоме RPC-повідомлення; інакше — загальний текст. */
export function friendlyRpcError(error: string | null | undefined, fallback: string): string {
  if (error && KNOWN_RPC_ERRORS.has(error)) return error
  return fallback
}
