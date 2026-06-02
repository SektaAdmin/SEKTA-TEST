'use client'
import { supabase } from '@/lib/supabase'
import { getClientBalance } from '@/lib/queries/clients'

export async function fetchClientBalance(clientId: string): Promise<number | null> {
  return getClientBalance(supabase, clientId)
}
