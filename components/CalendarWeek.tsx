'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import SlotCard from '@/components/SlotCard'
import CreateSlotModal from '@/components/CreateSlotModal'
import Sidebar from '@/components/Sidebar'
import type { ScheduleSlot } from '@/types'
import styles from '@/app/calendar/calendar.module.css'

const supabase = createClient()

const DAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

interface SlotWithEnrollments extends ScheduleSlot {
  enrollmentCount?: number
  maxCapacity?: number
}

export default function CalendarWeek() {
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
        const { count } = await supabase
          .from('enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('slot_id', slot.id)
          .eq('status', 'active')

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
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        {/* Topbar */}
        <div className={styles.topbar}>
          <h1 className={styles.title}>Календар</h1>
          <div className={styles.topbarRight}>
            <button className={styles.navBtn} onClick={handlePrevWeek} title="Попередній тиждень">
              ←
            </button>
            <button className={styles.navBtn} onClick={handleToday} title="Поточний тиждень">
              Сьогодні
            </button>
            <button className={styles.navBtn} onClick={handleNextWeek} title="Наступний тиждень">
              →
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : (
            <div className={styles.calendarGrid}>
              {Array.from({ length: 7 }).map((_, i) => {
                const date = new Date(weekStart)
                date.setDate(date.getDate() + i)
                const daySlots = getDaySlots(date)
                const isToday = new Date().toISOString().split('T')[0] === date.toISOString().split('T')[0]

                return (
                  <div key={i} className={`${styles.dayCard} ${isToday ? styles.dayCardToday : ''}`}>
                    <div className={styles.dayHeader}>
                      <div className={styles.dayLabel}>
                        {DAYS[date.getDay()]} {date.getDate()}.{String(date.getMonth() + 1).padStart(2, '0')}
                      </div>
                    </div>

                    <div className={styles.daySlots}>
                      {daySlots.length === 0 ? (
                        <div className={styles.noSlots}>Немає тренувань</div>
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

                    <button
                      className={styles.addButton}
                      onClick={() => handleDateClick(date)}
                      title="Додати тренування"
                    >
                      + Додати
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

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