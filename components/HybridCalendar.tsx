'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import styles from './HybridCalendar.module.css';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface CalendarEntry {
  layer: 'ONE-TIME' | 'REGULAR';
  entryId: string;
  slotDate?: string;
  startTime: string;
  courseName: string;
  trainerName: string;
  hallName: string;
  serviceName: string;
  price?: number;
  status: string;
  bookedClient?: string;
  enrollmentStatus?: string;
}

export default function HybridCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupedByTime, setGroupedByTime] = useState<Record<string, CalendarEntry[]>>({});

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate]);

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      const dateStr = currentDate.toISOString().split('T')[0];

      // Запрос: ONE-TIME слоты
      const { data: oneTimeData, error: oneTimeError } = await supabase
        .from('schedule_slots')
        .select(`
          id,
          slot_date,
          start_time,
          course_name,
          course_type,
          status,
          trainers (name),
          halls (name),
          tickets (name, price),
          enrollments!inner (
            id,
            status,
            clients (first_name, last_name)
          )
        `)
        .eq('slot_date', dateStr)
        .eq('is_cancelled', false);

      if (oneTimeError) throw oneTimeError;

      // Запрос: REGULAR слоты (постійні)
      const { data: regularData, error: regularError } = await supabase
        .from('regular_enrollments')
        .select(`
          id,
          schedules (
            title,
            start_time,
            trainers (name),
            halls (name)
          ),
          clients (first_name, last_name)
        `)
        .gt('valid_until', new Date().toISOString());

      if (regularError) throw regularError;

      // Трансформувати дані
      const formattedEntries: CalendarEntry[] = [];

      // ONE-TIME слоти
      oneTimeData?.forEach((slot: any) => {
        const enrollment = slot.enrollments?.[0];
        formattedEntries.push({
          layer: 'ONE-TIME',
          entryId: slot.id,
          slotDate: slot.slot_date,
          startTime: slot.start_time,
          courseName: slot.course_name,
          trainerName: slot.trainers?.name || 'Unknown',
          hallName: slot.halls?.name || 'Unknown',
          serviceName: slot.tickets?.name || slot.course_name,
          price: slot.tickets?.price,
          status: slot.status,
          bookedClient: enrollment
            ? `${enrollment.clients.first_name} ${enrollment.clients.last_name}`
            : undefined,
          enrollmentStatus: enrollment?.status,
        });
      });

      // REGULAR слоты
      regularData?.forEach((enrollment: any) => {
        if (enrollment.schedules) {
          formattedEntries.push({
            layer: 'REGULAR',
            entryId: enrollment.id,
            startTime: enrollment.schedules.start_time,
            courseName: enrollment.schedules.title,
            trainerName: enrollment.schedules.trainers?.name || 'Unknown',
            hallName: enrollment.schedules.halls?.name || 'Unknown',
            serviceName: 'Regular enrollment',
            status: 'booked',
            bookedClient: `${enrollment.clients.first_name} ${enrollment.clients.last_name}`,
            enrollmentStatus: 'active',
          });
        }
      });

      // Групування по часу
      const grouped: Record<string, CalendarEntry[]> = {};
      formattedEntries.forEach((entry) => {
        if (!grouped[entry.startTime]) {
          grouped[entry.startTime] = [];
        }
        grouped[entry.startTime].push(entry);
      });

      setGroupedByTime(grouped);
      setEntries(formattedEntries);
    } catch (error) {
      console.error('Error fetching calendar:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const formatDate = () => {
    return currentDate.toLocaleDateString('uk-UA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    return time.slice(0, 5); // "14:00:00" -> "14:00"
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Завантаження календаря...</p>
      </div>
    );
  }

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <h1 className={styles.title}>Гібридний календар</h1>
        <div className={styles.dateNav}>
          <button onClick={goToPreviousDay} className={styles.navButton}>
            ← Попередній день
          </button>
          <div className={styles.dateDisplay}>{formatDate()}</div>
          <button onClick={goToNextDay} className={styles.navButton}>
            Наступний день →
          </button>
        </div>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.badge} ${styles.oneTime}`}>NEW</span>
          <span>Разова услуга (schedule_slots)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.badge} ${styles.regular}`}>REG</span>
          <span>Постійна запис (regular_enrollments)</span>
        </div>
      </div>

      <div className={styles.entriesContainer}>
        {Object.keys(groupedByTime).length === 0 ? (
          <div className={styles.empty}>
            <p>Нема записів на цей день</p>
          </div>
        ) : (
          Object.entries(groupedByTime)
            .sort(([timeA], [timeB]) => timeA.localeCompare(timeB))
            .map(([time, entries]) => (
              <div key={time} className={styles.timeBlock}>
                <div className={styles.timeHeader}>
                  <span className={styles.time}>{formatTime(time)}</span>
                </div>

                <div className={styles.entriesList}>
                  {entries.map((entry, idx) => (
                    <div
                      key={entry.entryId}
                      className={`${styles.entry} ${styles[entry.layer.toLowerCase()]} ${styles[entry.status.toLowerCase()]}`}
                    >
                      <div className={styles.entryTop}>
                        <span
                          className={`${styles.layerBadge} ${styles[entry.layer.toLowerCase()]}`}
                        >
                          {entry.layer === 'ONE-TIME' ? 'NEW' : 'REG'}
                        </span>
                        <div className={styles.entryInfo}>
                          <div className={styles.entryTitle}>{entry.courseName}</div>
                          <div className={styles.entryMeta}>
                            <span className={styles.trainer}>{entry.trainerName}</span>
                            <span className={styles.hall}>{entry.hallName}</span>
                          </div>
                        </div>
                      </div>

                      {entry.serviceName && entry.serviceName !== 'Regular enrollment' && (
                        <div className={styles.serviceRow}>
                          <span className={styles.serviceName}>{entry.serviceName}</span>
                          {entry.price && (
                            <span className={styles.price}>{entry.price}₴</span>
                          )}
                        </div>
                      )}

                      <div className={styles.statusRow}>
                        {entry.bookedClient ? (
                          <div className={styles.booked}>
                            <span className={styles.checkmark}>✓</span>
                            <span>{entry.bookedClient}</span>
                          </div>
                        ) : (
                          <div className={styles.free}>
                            <span className={styles.circle}>⬜</span>
                            <span>Вільна місця</span>
                          </div>
                        )}
                      </div>

                      {entry.status === 'free' && entry.layer === 'ONE-TIME' && (
                        <button className={styles.bookButton}>
                          Записатись
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
