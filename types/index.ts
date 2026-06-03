export type PaymentMethod = 'cash' | 'fop' | 'personal_card' | 'deposit'

export interface TrainingType {
  id: string
  code: string
  label: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Client {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  instagram_username: string | null
  telegram_username: string | null
  balance?: number
  credit_limit?: number
  balance_updated_at?: string | null
}

export interface Ticket {
  id: string
  name: string
  ticket_type: string
  sessions: number
  price: number
  is_active: boolean
}

export interface Trainer {
  id: string
  name: string
  is_active: boolean
  instagram_username: string | null
  telegram_username: string | null
}

/**
 * Sale — row продажу виведено зі схеми в lib/queries/sales.ts через QueryData
 * (джерело істини = .select()). Реекспортуємо звідти, щоб тип не дублювався
 * і не розходився із запитом.
 */
export type { Sale } from '@/lib/queries/sales'

export interface ClientSessionBalance {
  client_id: string
  ticket_type: string
  sessions_balance: number
}

export interface ClassSeries {
  id: string
  type: 'template' | 'series'
  ticket_type: string
  trainer_id: string | null
  hall_id: string | null
  title: string | null
  notes: string | null
  capacity: number | null
  duration_min: number
  day_of_week: number   // 0=Нд..6=Сб
  time_of_day: string   // HH:mm
  created_at: string
  trainers?: { name: string } | null
  halls?: { name: string } | null
  series_clients?: { id: string; client_id: string }[]
}

export interface Hall {
  id: string
  name: string
  capacity: number
  description: string | null
  is_active: boolean
}

export interface Class {
  id: string
  trainer_id: string | null
  hall_id: string | null
  ticket_type: string
  title: string | null
  starts_at: string
  duration_min: number
  capacity: number | null
  is_cancelled: boolean
  notes: string | null
  choreo_stage: string | null
  series_id: string | null
  created_at: string
  updated_at: string
}
