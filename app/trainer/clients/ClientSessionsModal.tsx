'use client'
import { supabase } from '@/lib/supabase'
import { listMySessionBalances } from '@/lib/queries/client-cabinet-data'
import { useListQuery } from '@/hooks/useListQuery'
import { ModalShell } from '@/components/ui/ModalShell'
import { formatMoney } from '@/lib/formatters'
import { ticketTypeNominativeLabel } from '@/lib/badges'
import type { TrainerClientRow } from '@/lib/queries/trainer-cabinet'
import styles from './clients.module.css'

function clientName(c: TrainerClientRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

const SKELETON_ROWS = [0, 1]

function SessionsSkeleton() {
  return (
    <section className={styles.balanceBlock} role="status" aria-label="Завантаження...">
      {SKELETON_ROWS.map(i => (
        <div key={i} className={styles.balanceRow}>
          <div className={`skeleton-bone ${styles.skelBalanceLabel}`} />
          <div className={`skeleton-bone ${styles.skelBalanceNum}`} />
        </div>
      ))}
      <div className={styles.depositRow}>
        <div className={`skeleton-bone ${styles.skelBalanceLabel}`} />
        <div className={`skeleton-bone ${styles.skelDepositVal}`} />
      </div>
    </section>
  )
}

interface Props {
  client: TrainerClientRow
  onClose: () => void
}

/** Залишок занять клієнта для кабінету тренера — та сама картка, що в кабінеті
 *  клієнта (/subscriptions). Тренер за RLS (trainer_select на
 *  client_session_balances) бачить залишки всіх клієнтів; контакти лишаються
 *  закритими. Read-only: лише перегляд, без дій. */
export default function ClientSessionsModal({ client, onClose }: Props) {
  const { data: sessions, loading, error } = useListQuery(
    () => listMySessionBalances(supabase, client.id),
    [client.id]
  )
  const balance = client.balance ?? 0

  return (
    <ModalShell title={clientName(client)} onClose={onClose} footer={null}>
      <h2 className={styles.modalSectionLabel}>Залишок занять</h2>
      {loading ? (
        <SessionsSkeleton />
      ) : error ? (
        <div className={styles.empty}>Не вдалося завантажити.</div>
      ) : (
        <section className={styles.balanceBlock}>
          {sessions.length === 0 && (
            <div className={styles.balanceEmpty}>Немає активних абонементів</div>
          )}
          {sessions.map(s => (
            <div key={s.ticket_type} className={styles.balanceRow}>
              <span className={styles.balanceRowLabel} title={ticketTypeNominativeLabel(s.ticket_type)}>
                {ticketTypeNominativeLabel(s.ticket_type)}
              </span>
              {s.sessions_balance > 0 ? (
                <span className={styles.balanceSessions}>
                  <span className={styles.balanceSessionsNum}>{s.sessions_balance}</span>
                  <span className={styles.balanceSessionsUnit}>год</span>
                </span>
              ) : (
                <span className={styles.balanceZero}>Вичерпано</span>
              )}
            </div>
          ))}
          <div className={styles.depositRow}>
            <span className={styles.depositLabel}>Депозит</span>
            <span className={`${styles.depositValue} ${balance < 0 ? styles.depositValueNeg : balance === 0 ? styles.depositValueZero : ''}`}>
              {formatMoney(balance)}
            </span>
          </div>
        </section>
      )}
    </ModalShell>
  )
}
