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
): Promise<Transaction[]> {
  const { data } = await supabase
    .from('balance_transactions')
    .select('id, amount, transaction_type, balance_before, balance_after, description, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as Transaction[]) ?? []
}

export async function listBalanceAfterBySaleIds(
  supabase: SupabaseClient,
  saleIds: string[]
): Promise<Map<string, number>> {
  if (saleIds.length === 0) return new Map()
  const { data } = await supabase
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
  return map
}
