'use client'
import type { ScheduleSlot } from '@/types'

interface Props {
  slot: ScheduleSlot
  enrollmentCount: number
  maxCapacity: number
  onClick: () => void
}

export default function SlotCard({ slot, enrollmentCount, maxCapacity, onClick }: Props) {
  const fillPercent = Math.min((enrollmentCount / maxCapacity) * 100, 100)
  const isFull = enrollmentCount >= maxCapacity

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s',
        hover: { boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
        el.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = 'none'
        el.style.transform = 'translateY(0)'
      }}
    >
      {/* Час */}
      <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
        {slot.start_time.slice(0, 5)}
      </div>

      {/* Назва + тип */}
      <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
        {slot.course_name}
      </div>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
        {slot.course_type}
      </div>

      {/* Тренер + Зал */}
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', lineHeight: '1.4' }}>
        {slot.trainer_id && <div>👤 Тренер</div>}
        {slot.hall_id && <div>🏢 Зал</div>}
      </div>

      {/* Полоска заповненості */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{
          width: '100%',
          height: '6px',
          backgroundColor: '#e5e7eb',
          borderRadius: '3px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${fillPercent}%`,
            height: '100%',
            backgroundColor: isFull ? '#ef4444' : '#10a981',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Кількість місць */}
      <div style={{
        fontSize: '12px',
        fontWeight: '500',
        color: isFull ? '#ef4444' : '#666',
      }}>
        {enrollmentCount}/{maxCapacity}
        {isFull && ' (повно)'}
      </div>
    </div>
  )
}
