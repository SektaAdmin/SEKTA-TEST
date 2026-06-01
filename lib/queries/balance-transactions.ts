import type { SupabaseClient } from '@supabase/supabase-js'

export interface Transaction {
  id: string
  amount: number
  transaction_type: string
  balance_before: number
  balance_after: number
  description: string | null
  created_at: string
}

export async function listClientTransactions(
  supabase: SupabaseClient,
  clientId: string,
  limit = 20
): Promise<{ data: Transaction[]; error: string | null }> {
  const { data, error } = await supabase
    .from('balance_transactions')
    .select('id, amount, transaction_type, balance_before, balance_after, description, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data: (data as Transaction[]) ?? [], error: error?.message ?? null }
}

export async function listBalanceAfterBySaleIds(
  supabase: SupabaseClient,
  saleIds: string[]
): Promise<{ data: Map<string, number>; error: string | null }> {
  if (saleIds.length === 0) return { data: new Map(), error: null }
  const { data, error } = await supabase
    .from('balance_transactions')
    .select('related_sale_id, balance_after')
    .in('related_sale_id', saleIds)
    .order('created_at', { ascending: false })
  const map = new Map<string, number>()
  for (const tx of (data ?? []) as { related_sale_id: string; balance_after: number }[]) {
    if (tx.related_sale_id != null && !map.has(tx.related_sale_id)) {
      map.set(tx.related_sale_id, tx.balance_after)
    }
  }
  return { data: map, error: error?.message ?? null }
}
