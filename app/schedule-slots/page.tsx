'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import ScheduleSlotsModal from '@/components/ScheduleSlotsModal'

const supabase = createClient()

interface ScheduleSlot {
  id: string
  slot_date: string
  start_time: string
  course_name: string
  course_type: string
  is_cancelled: boolean
  created_at: string
}

export default function ScheduleSlotsPage() {
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterDate, setFilterDate] = useState<string>('')

  useEffect(() => {
    loadSlots()
  }, [filterDate])

  async function loadSlots() {
    setLoading(true)
    let query = supabase
      .from('schedule_slots')
      .select('id, slot_date, start_time, course_name, course_type, is_cancelled, created_at')
      .order('slot_date', { ascending: false })
      .limit(100)

    if (filterDate) {
      query = query.gte('slot_date', filterDate).lt('slot_date', new Date(new Date(filterDate).getTime() + 7*24*60*60*1000).toISOString().split('T')[0])
    }

    const { data, error } = await query
    if (error) {
      console.error('Error loading slots:', error)
    } else {
      setSlots((data as ScheduleSlot[]) ?? [])
    }
    setLoading(false)
  }

  async function handleDeleteSlot(id: string) {
    if (!confirm('Видалити цей слот?')) return
    
    const { error } = await supabase
      .from('schedule_slots')
      .delete()
      .eq('id', id)

    if (error) {
      alert('Помилка при видаленні: ' + error.message)
    } else {
      loadSlots()
    }
  }

  async function handleToggleCancelled(id: string, isCancelled: boolean) {
    const { error } = await supabase
      .from('schedule_slots')
      .update({ is_cancelled: !isCancelled })
      .eq('id', id)

    if (error) {
      alert('Помилка: ' + error.message)
    } else {
      loadSlots()
    }
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Слоти розкладу</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '10px 16px',
            backgroundColor: '#10a981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          + Генерувати слоти
        </button>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Фільтр по тижню:
        </label>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        />
      </div>

      {/* Slots list */}
      <div style={{ 
        display: 'grid', 
        gap: '1rem',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      }}>
        {slots.length === 0 ? (
          <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888' }}>
            {loading ? 'Завантаження...' : 'Немає слотів. Створіть їх за допомогою кнопки вище.'}
          </p>
        ) : (
          slots.map(slot => (
            <div
              key={slot.id}
              style={{
                padding: '1rem',
                border: '1px solid #ddd',
                borderRadius: '8px',
                backgroundColor: slot.is_cancelled ? '#fef3c7' : '#fff',
                opacity: slot.is_cancelled ? 0.7 : 1,
              }}
            >
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>{slot.course_name}</strong>
                {slot.is_cancelled && <span style={{ marginLeft: '0.5rem', color: '#dc2626' }}>❌ Скасовано</span>}
              </div>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '0.5rem' }}>
                📅 {new Date(slot.slot_date).toLocaleDateString('uk-UA')}
                <br />
                🕐 {slot.start_time}
                <br />
                📝 {slot.course_type}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
                <button
                  onClick={() => handleToggleCancelled(slot.id, slot.is_cancelled)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    fontSize: '12px',
                    backgroundColor: slot.is_cancelled ? '#10a981' : '#fbbf24',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {slot.is_cancelled ? '✓ Активувати' : '⊘ Скасувати'}
                </button>
                <button
                  onClick={() => handleDeleteSlot(slot.id)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    fontSize: '12px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Видалити
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <ScheduleSlotsModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            loadSlots()
          }}
        />
      )}
    </div>
  )
}
