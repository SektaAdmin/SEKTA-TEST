import type { SupabaseClient } from '@supabase/supabase-js'

export type TrainerRate = {
  id: string
  trainer_id: string | null
  trainer_name: string | null
  ticket_type: string
  rate: number
  created_at: string
}

export type TrainerSalaryRow = {
  ticket_type: string
  sessions_total: number
  rate: number | null
  amount: number
}

export type TrainerPayment = {
  id: string
  trainer_id: string
  period_start: string
  period_end: string
  calculated_amount: number
  paid_amount: number
  payment_date: string
  notes: string | null
  created_at: string
}

export async function listTrainerRates(
  supabase: SupabaseClient
): Promise<TrainerRate[]> {
  const { data } = await supabase
    .from('trainer_rates')
    .select('id, trainer_id, ticket_type, rate, created_at, trainers(name)')
    .order('ticket_type')
    .order('trainer_id', { nullsFirst: true })
  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    trainer_id: r.trainer_id,
    trainer_name: r.trainers?.name ?? null,
    ticket_type: r.ticket_type,
    rate: r.rate,
    created_at: r.created_at,
  }))
}

export async function upsertTrainerRate(
  supabase: SupabaseClient,
  payload: { id?: string; trainer_id: string | null; ticket_type: string; rate: number }
): Promise<{ error: string | null }> {
  if (payload.id) {
    const { error } = await supabase
      .from('trainer_rates')
      .update({ rate: payload.rate })
      .eq('id', payload.id)
    return { error: error?.message ?? null }
  }
  const { error } = await supabase
    .from('trainer_rates')
    .upsert(
      { trainer_id: payload.trainer_id, ticket_type: payload.ticket_type, rate: payload.rate },
      { onConflict: 'trainer_id,ticket_type' }
    )
  return { error: error?.message ?? null }
}

export async function deleteTrainerRate(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainer_rates').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export async function calcTrainerSalary(
  supabase: SupabaseClient,
  trainerId: string,
  start: string,
  end: string
): Promise<TrainerSalaryRow[]> {
  const { data, error } = await supabase.rpc('calc_trainer_salary', {
    p_trainer_id: trainerId,
    p_start: start,
    p_end: end,
  })
  if (error || !data) return []
  return (data as any[]).map(r => ({
    ticket_type: r.ticket_type,
    sessions_total: r.sessions_total,
    rate: r.rate ?? null,
    amount: r.amount,
  }))
}

export async function listTrainerPayments(
  supabase: SupabaseClient,
  trainerId: string,
  periodStart: string,
  periodEnd: string
): Promise<TrainerPayment[]> {
  const { data } = await supabase
    .from('trainer_payments')
    .select('*')
    .eq('trainer_id', trainerId)
    .lte('period_start', periodEnd)
    .gte('period_end', periodStart)
    .order('created_at', { ascending: false })
  return (data ?? []) as TrainerPayment[]
}

export async function insertTrainerPayment(
  supabase: SupabaseClient,
  payload: {
    trainer_id: string
    period_start: string
    period_end: string
    calculated_amount: number
    paid_amount: number
    payment_date: string
    notes: string | null
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainer_payments').insert(payload)
  return { error: error?.message ?? null }
}
