'use client'
import { createClient } from '@/lib/supabase'
import type { ScheduleSlot } from '@/types'

const supabase = createClient()

export async function getWeekSlots(weekStart: Date) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const startStr = weekStart.toISOString().split('T')[0]
  const endStr = weekEnd.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('schedule_slots')
    .select(`
      id,
      schedule_id,
      slot_date,
      start_time,
      hall_id,
      trainer_id,
      course_name,
      course_type,
      capacity_override,
      is_cancelled,
      sessions_processed
    `)
    .gte('slot_date', startStr)
    .lt('slot_date', endStr)
    .eq('is_cancelled', false)
    .order('slot_date')
    .order('start_time')

  if (error) throw new Error(error.message)
  return (data as ScheduleSlot[]) ?? []
}

export async function getSlotEnrollments(slotId: string) {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, client_id, status')
    .eq('slot_id', slotId)
    .eq('status', 'active')

  if (error) throw new Error(error.message)
  return (data ?? []).length
}

export async function getHallCapacity(hallId: string) {
  const { data, error } = await supabase
    .from('halls')
    .select('capacity')
    .eq('id', hallId)
    .single()

  if (error) throw new Error(error.message)
  return data?.capacity ?? 10
}

export async function createSlot(slot: Partial<ScheduleSlot>) {
  const { error } = await supabase
    .from('schedule_slots')
    .insert(slot)

  if (error) throw new Error(error.message)
}

export async function getHalls() {
  const { data, error } = await supabase
    .from('halls')
    .select('id, name, capacity')
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getTrainers() {
  const { data, error } = await supabase
    .from('trainers')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(error.message)
  return data ?? []
}
