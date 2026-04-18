'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import styles from './BookingModal.module.css';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface BookingModalProps {
  slotId: string;
  slotDate: string;
  startTime: string;
  courseName: string;
  price?: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BookingModal({
  slotId,
  slotDate,
  startTime,
  courseName,
  price,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      setSearching(true);
      const { data, error: err } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, balance')
        .order('first_name')
        .limit(50);

      if (err) throw err;
      setClients(data || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
      setError('Помилка при завантаженні клієнтів');
    } finally {
      setSearching(false);
    }
  };

  const filteredClients = clients.filter(
    (client) =>
      client.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.phone && client.phone.includes(searchQuery))
  );

  const handleBook = async () => {
    if (!selectedClientId) {
      setError('Виберіть клієнта');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Додай запись в enrollments
      const now = new Date().toISOString();
      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from('enrollments')
        .insert([
          {
            slot_id: slotId,
            client_id: selectedClientId,
            status: 'active',
            is_regular: false,
            sessions_deducted: 1,
            enrolled_at: now,
            updated_at: now,
          },
        ])
        .select();

      if (enrollmentError) throw enrollmentError;

      // 2. Оновлюємо статус слота
      const { error: updateError } = await supabase
        .from('schedule_slots')
        .update({ status: 'booked' })
        .eq('id', slotId);

      if (updateError) throw updateError;

      // Успіх!
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error booking:', err);
      setError(err.message || 'Помилка при запису');
    } finally {
      setLoading(false);
    }
  };

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Запиши клієнта</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* Слот інформація */}
          <div className={styles.slotInfo}>
            <div className={styles.slotDetail}>
              <span className={styles.label}>Послуга:</span>
              <span className={styles.value}>{courseName}</span>
            </div>
            <div className={styles.slotDetail}>
              <span className={styles.label}>Дата:</span>
              <span className={styles.value}>{slotDate}</span>
            </div>
            <div className={styles.slotDetail}>
              <span className={styles.label}>Час:</span>
              <span className={styles.value}>{startTime}</span>
            </div>
            {price && (
              <div className={styles.slotDetail}>
                <span className={styles.label}>Ціна:</span>
                <span className={styles.value}>{price}₴</span>
              </div>
            )}
          </div>

          {/* Пошук клієнта */}
          <div className={styles.searchSection}>
            <label className={styles.searchLabel}>Виберіть клієнта:</label>
            <div className={styles.searchBox}>
              <input
                type="text"
                placeholder="Пошук по імені, прізвищу або телефону..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            {/* Список клієнтів */}
            <div className={styles.clientsList}>
              {searching ? (
                <div className={styles.loading}>Завантаження...</div>
              ) : filteredClients.length === 0 ? (
                <div className={styles.noResults}>
                  {searchQuery
                    ? 'Клієнти не знайдені'
                    : 'Немає доступних клієнтів'}
                </div>
              ) : (
                filteredClients.map((client) => (
                  <button
                    key={client.id}
                    className={`${styles.clientItem} ${
                      selectedClientId === client.id ? styles.selected : ''
                    }`}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <div className={styles.clientName}>
                      {client.first_name} {client.last_name}
                    </div>
                    <div className={styles.clientMeta}>
                      {client.phone && (
                        <span className={styles.phone}>{client.phone}</span>
                      )}
                      <span className={styles.balance}>
                        Баланс: {client.balance}₴
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Інформація про вибраного клієнта */}
          {selectedClient && (
            <div className={styles.selectedInfo}>
              <div className={styles.selectedDetail}>
                <span className={styles.label}>Обраний клієнт:</span>
                <span className={styles.value}>
                  {selectedClient.first_name} {selectedClient.last_name}
                </span>
              </div>
              <div className={styles.selectedDetail}>
                <span className={styles.label}>Баланс:</span>
                <span className={styles.value}>{selectedClient.balance}₴</span>
              </div>
            </div>
          )}

          {/* Помилка */}
          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Скасувати
          </button>
          <button
            className={styles.bookButton}
            onClick={handleBook}
            disabled={!selectedClientId || loading}
          >
            {loading ? 'Записуємо...' : 'Записати'}
          </button>
        </div>
      </div>
    </div>
  );
}
