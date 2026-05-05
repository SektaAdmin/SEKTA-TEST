'use client'
import { supabase } from '@/lib/supabase'

export async function fetchClientBalance(clientId: string): Promise<number | null> {
  const { data } = await supabase
    .from('clients')
    .select('balance')
    .eq('id', clientId)
    .single()
  return data?.balance ?? null
}
