/* Імена FK для disambiguation PostgREST-embed.

   sales / studio_expenses / trainer_payments мають ДВА FK на trainers:
   trainer_id (хто вів / кому платять) + cash_holder (хто прийняв готівку).
   Тому embed `trainers(...)` на цих таблицях неоднозначний → рантайм-помилка
   "Could not embed because more than one relationship was found".
   Завжди вживати явний FK звідси: trainers!${TRAINER_FK.sales}(name).

   Перевірка інваріанту:
   grep -rn "trainers(" lib/queries | grep -v "_fkey"  → має бути порожньо. */
export const TRAINER_FK = {
  sales:    'sales_trainer_id_fkey',
  expenses: 'studio_expenses_trainer_id_fkey',
  payments: 'trainer_payments_trainer_id_fkey',
} as const
