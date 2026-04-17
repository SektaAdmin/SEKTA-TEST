export type PaymentMethod = 'cash' | 'fop' | 'personal_card'

export interface Client {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  instagram_username: string | null
  telegram_username: string | null
  balance?: number
  credit_limit?: number
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
  sessions: number | null
  price_paid: number
  amount_given: number
  payment_method: PaymentMethod
  notes: string | null
  clients: Pick<Client, 'first_name' | 'last_name'>
  tickets: Pick<Ticket, 'name'> | null
  trainers: Pick<Trainer, 'name'> | null
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

export interface Schedule {
  id: string
  title: string
  schedule_type: string
  trainer_id: string | null
  hall_id: string
  day_of_week: number        // було days_of_week: number[]
  start_time: string
  duration_minutes: number
  sessions_cost: number      // нове поле
  max_capacity: number
  reserve_slots: number
  is_active: boolean
  trainers?: { name: string } | null
  halls?: { name: string } | null
  group_id?: string | null
}

export type RegularEnrollment = {
  id: string
  client_id: string
  schedule_id: string
  valid_until: string | null
  created_at: string
  clients: {
    id: string
    first_name: string
    last_name: string
    phone: string
  }
  schedules: {
    id: string
    title: string
    schedule_type: string
    day_of_week: number
    start_time: string
    trainer_id: string
    hall_id: string
    trainers: {
      name: string
    }
    halls: {
      name: string
    }
  }

}
export interface ScheduleSlot {
  id: string
  schedule_id: string | null
  slot_date: string
  start_time: string
  duration_minutes?: number
  hall_id: string
  trainer_id: string | null
  course_name: string
  course_type: string
  capacity_override: number | null
  is_cancelled: boolean
  sessions_processed: boolean
  created_at: string
  halls?: { name: string } | null
  trainers?: { name: string } | null
}
