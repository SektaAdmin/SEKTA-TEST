'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import BookingModal from './BookingModal';
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

interface BookingSlot {
  slotId: string;
  slotDate: string;
  startTime: string;
  courseName: string;
  price?: number;
}

export default function HybridCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupedByTime, setGroupedByTime] = useState<Record<string, CalendarEntry[]>>({});
  const [bookingSlot, setBookingSlot] = useState<BookingSlot | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate]);

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      const dateStr = currentDate.toISOString().split('T')[0];
      console.log('Fetching for date:', dateStr);

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
          enrollments (
            id,
            status,
            clients (first_name, last_name)
          )
        `)
        .eq('slot_date', dateStr)
        .eq('is_cancelled', false);

      console.log('OneTimeData:', oneTimeData?.length, oneTimeError);

      const { data: regularData, error: regularError } = await supabase
        .from('regular_enrollments')
        .select(`
          id,
          client_id,
          schedule_id,
          valid_until
        `)
        .gt('valid_until', new Date().toISOString());

      if (regularError) throw regularError;

      const formattedEntries: CalendarEntry[] = [];

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

      // Загрузи schedules для regular_enrollments
      let schedulesMap: Record<string, any> = {};
      let clientsMap: Record<string, any> = {};
      let trainersMap: Record<string, string> = {};
      let hallsMap: Record<string, string> = {};

      if (regularData && regularData.length > 0) {
        const scheduleIds = [...new Set(regularData.map((e: any) => e.schedule_id).filter(Boolean))];
        const clientIds = [...new Set(regularData.map((e: any) => e.client_id).filter(Boolean))];

        // Загрузи schedules
        if (scheduleIds.length > 0) {
          const { data: schedules } = await supabase
            .from('schedules')
            .select('id, title, start_time, trainer_id, hall_id')
            .in('id', scheduleIds);
          schedules?.forEach((s: any) => {
            schedulesMap[s.id] = s;
          });
        }

        // Загрузи clients
        if (clientIds.length > 0) {
          const { data: clients } = await supabase
            .from('clients')
            .select('id, first_name, last_name')
            .in('id', clientIds);
          clients?.forEach((c: any) => {
            clientsMap[c.id] = c;
          });
        }

        // Загрузи trainers
        const trainerIds = [...new Set(Object.values(schedulesMap).map((s: any) => s.trainer_id).filter(Boolean))];
        if (trainerIds.length > 0) {
          const { data: trainers } = await supabase
            .from('trainers')
            .select('id, name')
            .in('id', trainerIds);
          trainers?.forEach((t: any) => {
            trainersMap[t.id] = t.name;
          });
        }

        // Загрузи halls
        const hallIds = [...new Set(Object.values(schedulesMap).map((s: any) => s.hall_id).filter(Boolean))];
        if (hallIds.length > 0) {
          const { data: halls } = await supabase
            .from('halls')
            .select('id, name')
            .in('id', hallIds);
          halls?.forEach((h: any) => {
            hallsMap[h.id] = h.name;
          });
        }
      }

      regularData?.forEach((enrollment: any) => {
        const schedule = schedulesMap[enrollment.schedule_id];
        const client = clientsMap[enrollment.client_id];

        if (schedule && client) {
          formattedEntries.push({
            layer: 'REGULAR',
            entryId: enrollment.id,
            startTime: schedule.start_time,
            courseName: schedule.title,
            trainerName: trainersMap[schedule.trainer_id] || 'Unknown',
            hallName: hallsMap[schedule.hall_id] || 'Unknown',
            serviceName: 'Regular enrollment',
            status: 'booked',
            bookedClient: `${client.first_name} ${client.last_name}`,
            enrollmentStatus: 'active',
          });
        }
      });

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
    return time.slice(0, 5);
  };

  const handleBookClick = (entry: CalendarEntry) => {
    setBookingSlot({
      slotId: entry.entryId,
      slotDate: entry.slotDate || currentDate.toISOString().split('T')[0],
      startTime: entry.startTime,
      courseName: entry.courseName,
      price: entry.price,
    });
    setShowModal(true);
  };

  const handleBookingSuccess = () => {
    // Оновлюємо календар після успішного запису
    fetchCalendarData();
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
          <span className={`${styles.badge} ${styles.onetime}`}>NEW</span>
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
                        <button
                          className={styles.bookButton}
                          onClick={() => handleBookClick(entry)}
                        >
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

      {/* Booking Modal */}
      {showModal && bookingSlot && (
        <BookingModal
          slotId={bookingSlot.slotId}
          slotDate={bookingSlot.slotDate}
          startTime={bookingSlot.startTime}
          courseName={bookingSlot.courseName}
          price={bookingSlot.price}
          onClose={() => setShowModal(false)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}
