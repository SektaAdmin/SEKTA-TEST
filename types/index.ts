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

export interface Sale {
  id: string
  created_at: string
  client_id: string
  ticket_id: string | null
  trainer_id: string | null
  ticket_name: string | null
  ticket_price: number | null
  ticket_type: string | null
  sessions: number | null
  price_paid: number
  amount_given: number
  payment_method: PaymentMethod
  notes: string | null
  clients: Pick<Client, 'first_name' | 'last_name'>
  tickets: Pick<Ticket, 'name'> | null
  trainers: Pick<Trainer, 'name'> | null
}

export interface ClientSessionBalance {
  client_id: string
  ticket_type: string
  sessions_balance: number
}

export interface SaleFormData {
  client_id: string
  ticket_id: string
  trainer_id: string | null
  price_paid: number
  amount_given: number
  payment_method: PaymentMethod
  notes: string
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
  created_at: string
  updated_at: string
}

export interface Enrollment {
  id: string
  class_id: string
  client_id: string
  status: 'enrolled' | 'attended' | 'cancelled' | 'noshow'
  sessions_used: number
  sale_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
