'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import SlotCard from '@/components/SlotCard'
import CreateSlotModal from '@/components/CreateSlotModal'
import type { ScheduleSlot } from '@/types'

const supabase = createClient()

const DAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

interface SlotWithEnrollments extends ScheduleSlot {
  enrollmentCount?: number
  maxCapacity?: number
}

export default function CalendarWeek() {
  useEffect(() => {
  const today = new Date()
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
  setWeekStart(new Date(today.setDate(diff)))
}, [])

const [weekStart, setWeekStart] = useState<Date>(() => {
  const today = new Date()
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(today.setDate(diff))
})

  const [slots, setSlots] = useState<SlotWithEnrollments[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  useEffect(() => {
    loadSlots()
  }, [weekStart])

  async function loadSlots() {
    setLoading(true)
    try {
      const startStr = weekStart.toISOString().split('T')[0]
      const endStr = weekEnd.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('schedule_slots')
        .select('*')
        .gte('slot_date', startStr)
        .lt('slot_date', endStr)
        .eq('is_cancelled', false)
        .order('slot_date')
        .order('start_time')

      if (error) throw error

      const slotsWithEnrollments: SlotWithEnrollments[] = []

      for (const slot of (data as ScheduleSlot[]) ?? []) {
        // Отримуємо кількість записаних
        const { count } = await supabase
          .from('enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('slot_id', slot.id)
          .eq('status', 'active')

        // Отримуємо максимум місць
        const { data: hallData } = await supabase
          .from('halls')
          .select('capacity')
          .eq('id', slot.hall_id)
          .single()

        slotsWithEnrollments.push({
          ...slot,
          enrollmentCount: count ?? 0,
          maxCapacity: slot.capacity_override ?? hallData?.capacity ?? 10,
        })
      }

      setSlots(slotsWithEnrollments)
    } catch (err) {
      console.error('Error loading slots:', err)
    } finally {
      setLoading(false)
    }
  }

  const getDaySlots = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return slots.filter(s => s.slot_date === dateStr)
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setShowCreateModal(true)
  }

  const handlePrevWeek = () => {
    const prev = new Date(weekStart)
    prev.setDate(prev.getDate() - 7)
    setWeekStart(prev)
  }

  const handleNextWeek = () => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    setWeekStart(next)
  }

  const handleToday = () => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    setWeekStart(new Date(today.setDate(diff)))
  }

  return (
    <div style={{ padding: '2rem' }}>
      {/* Заголовок + навігація */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Календар</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handlePrevWeek}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: '#fff',
            }}
          >
            ← Попередній
          </button>
          <button
            onClick={handleToday}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: '#fff',
            }}
          >
            Сьогодні
          </button>
          <button
            onClick={handleNextWeek}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: '#fff',
            }}
          >
            Наступний →
          </button>
        </div>
      </div>

      {/* Дати тижня */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px', marginBottom: '2rem' }}>
        {Array.from({ length: 7 }).map((_, i) => {
          const date = new Date(weekStart)
          date.setDate(date.getDate() + i)
          const daySlots = getDaySlots(date)
          const isToday = new Date().toISOString().split('T')[0] === date.toISOString().split('T')[0]

          return (
            <div
              key={i}
              style={{
                border: isToday ? '2px solid #10a981' : '1px solid #ddd',
                borderRadius: '8px',
                padding: '12px',
                backgroundColor: isToday ? '#ecfdf5' : '#fff',
              }}
            >
              <div style={{
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '12px',
                color: isToday ? '#10a981' : '#000',
              }}>
                {DAYS[date.getDay()]} {date.getDate()}.{String(date.getMonth() + 1).padStart(2, '0')}
              </div>

              {/* Слоти дня */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {daySlots.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#ccc', textAlign: 'center', padding: '20px 0' }}>
                    Немає тренувань
                  </div>
                ) : (
                  daySlots.map(slot => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      enrollmentCount={slot.enrollmentCount ?? 0}
                      maxCapacity={slot.maxCapacity ?? 10}
                      onClick={() => console.log('Click slot:', slot.id)}
                    />
                  ))
                )}
              </div>

              {/* Кнопка додавання */}
              <button
                onClick={() => handleDateClick(date)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px dashed #ddd',
                  backgroundColor: '#fafafa',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#666',
                }}
              >
                + Додати
              </button>
            </div>
          )
        })}
      </div>

      {showCreateModal && selectedDate && (
        <CreateSlotModal
          selectedDate={selectedDate}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false)
            loadSlots()
          }}
        />
      )}
    </div>
  )
}
