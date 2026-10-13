import type { Db, Row } from '@/lib/queries/_db'

// Відпускні тренерів: дата старту кварталів (trainers.vacation_start_date),
// періоди відпусток (trainer_vacations, м'яке видалення) і ЗП за квартал.
// Логіка розрахунку — lib/vacation.ts. Виплати — trainer_payments з payment_type='vacation'.

export type TrainerVacation = Pick<Row<'trainer_vacations'>, 'id' | 'trainer_id' | 'date_from' | 'date_to' | 'notes'>

export async function getTrainerVacationStartDate(
  supabase: Db,
  trainerId: string
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('trainers')
    .select('vacation_start_date')
    .eq('id', trainerId)
    .single()
  return { data: data?.vacation_start_date ?? null, error: error?.message ?? null }
}

export async function updateTrainerVacationStartDate(
  supabase: Db,
  trainerId: string,
  startDate: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('trainers')
    .update({ vacation_start_date: startDate })
    .eq('id', trainerId)
  return { error: error?.message ?? null }
}

export async function listTrainerVacations(
  supabase: Db,
  trainerId: string
): Promise<{ data: TrainerVacation[]; error: string | null }> {
  const { data, error } = await supabase
    .from('trainer_vacations')
    .select('id, trainer_id, date_from, date_to, notes')
    .eq('trainer_id', trainerId)
    .eq('is_active', true)
    .order('date_from', { ascending: false })
  return { data: data ?? [], error: error?.message ?? null }
}

export async function insertTrainerVacation(
  supabase: Db,
  payload: { trainer_id: string; date_from: string; date_to: string; notes: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainer_vacations').insert(payload)
  return { error: error?.message ?? null }
}

/** М'яке видалення (інв. #4). */
export async function deactivateTrainerVacation(
  supabase: Db,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainer_vacations').update({ is_active: false }).eq('id', id)
  return { error: error?.message ?? null }
}

export type VacationPayment = Pick<
  Row<'trainer_payments'>,
  'id' | 'period_start' | 'period_end' | 'calculated_amount' | 'paid_amount' | 'payment_date' | 'payment_method' | 'notes'
>

export async function listVacationPayments(
  supabase: Db,
  trainerId: string
): Promise<{ data: VacationPayment[]; error: string | null }> {
  const { data, error } = await supabase
    .from('trainer_payments')
    .select('id, period_start, period_end, calculated_amount, paid_amount, payment_date, payment_method, notes')
    .eq('trainer_id', trainerId)
    .eq('payment_type', 'vacation')
    .order('payment_date', { ascending: false })
  return { data: data ?? [], error: error?.message ?? null }
}

/**
 * ЗП тренера за кожен квартал — сума trainer_amount з calc_trainer_salary_v2.
 * Межі `T00:00:00`/`T23:59:59` — точно як на /settings/salary/calculations,
 * щоб «ЗП за період» збігалася з «Нараховано» там. Гейт RPC: trainer — лише себе.
 */
export async function getTrainerSalaryByQuarters(
  supabase: Db,
  trainerId: string,
  quarters: { start: string; end: string }[]
): Promise<{ data: number[]; error: string | null }> {
  const results = await Promise.all(
    quarters.map(q =>
      supabase.rpc('calc_trainer_salary_v2', {
        p_trainer_id: trainerId,
        p_start: `${q.start}T00:00:00`,
        p_end: `${q.end}T23:59:59`,
      })
    )
  )
  const error = results.find(r => r.error)?.error?.message ?? null
  const data = results.map(r => (r.data ?? []).reduce((s, row) => s + Number(row.trainer_amount), 0))
  return { data, error }
}
