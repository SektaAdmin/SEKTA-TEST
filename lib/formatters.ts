import type { Client } from '@/types'

type NameFields = Pick<Client, 'first_name' | 'last_name'>

export function formatClientName(c: NameFields): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

export function formatClientLabel(c: NameFields & Pick<Client, 'phone' | 'id'>): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone || c.id
}
