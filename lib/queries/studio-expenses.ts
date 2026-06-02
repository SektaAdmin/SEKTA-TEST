import type { Db } from '@/lib/queries/_db'
import { TRAINER_FK } from '@/lib/queries/_fk'

export type StudioExpense = {
  id: string
  amount: number
  direction: 'expense' | 'income'
  payment_method: 'cash' | 'fop' | 'personal_card'
  trainer_id: string | null
  cash_holder: string | null
  description: string | null
  created_at: string
  trainers: { name: string } | null
}

export async function listStudioExpenses(
  supabase: Db,
  dateFrom: string,
  dateTo: string
): Promise<{ data: StudioExpense[]; error: string | null }> {
  const { data, error } = await supabase
    .from('studio_expenses')
    .select(`id, amount, direction, payment_method, trainer_id, cash_holder, description, created_at, trainers!${TRAINER_FK.expenses}(name)`)
    .gte('created_at', `${dateFrom}T00:00:00`)
    .lte('created_at', `${dateTo}T23:59:59`)
    .order('created_at', { ascending: false })
  return { data: (data as unknown as StudioExpense[]) ?? [], error: error?.message ?? null }
}

export async function insertStudioExpense(
  supabase: Db,
  params: {
    amount: number
    direction: 'expense' | 'income'
    payment_method: 'cash' | 'fop' | 'personal_card'
    trainer_id: string | null
    cash_holder: string | null
    description: string | null
    created_at: string
  }
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase.from('studio_expenses').insert(params)
  return { success: !error, error: error?.message ?? null }
}

export async function updateStudioExpense(
  supabase: Db,
  id: string,
  params: {
    amount: number
    direction: 'expense' | 'income'
    payment_method: 'cash' | 'fop' | 'personal_card'
    trainer_id: string | null
    cash_holder: string | null
    description: string | null
    created_at: string
  }
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase.from('studio_expenses').update(params).eq('id', id)
  return { success: !error, error: error?.message ?? null }
}

export async function deleteStudioExpense(
  supabase: Db,
  id: string
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase.from('studio_expenses').delete().eq('id', id)
  return { success: !error, error: error?.message ?? null }
}
