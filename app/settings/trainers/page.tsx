'use client'
import TrainerModal from '@/components/TrainerModal'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listTrainers, toggleTrainer } from '@/lib/queries/trainers'
import { MSG } from '@/lib/messages'
import { RefEntityPage, type RefColumn } from '../_RefEntityPage'
import styles from '../settings.module.css'
import type { Trainer } from '@/types'

const columns: RefColumn<Trainer>[] = [
  { header: 'Ім\'я', cell: t => t.name, tdClassName: styles.name },
  {
    header: 'Телефон',
    cell: t => t.phone ?? <span className={styles.dash}>—</span>,
    card: t => t.phone ? <span>{t.phone}</span> : null,
    tdClassName: styles.mono,
  },
  {
    header: 'Email',
    cell: t => t.email ?? <span className={styles.dash}>—</span>,
    card: t => t.email ? <span>{t.email}</span> : null,
  },
  {
    header: 'Instagram',
    cell: t => t.instagram_username
      ? <span>@{t.instagram_username}</span>
      : <span className={styles.dash}>—</span>,
    card: t => t.instagram_username
      ? <span className={styles.handle}>@{t.instagram_username}</span>
      : null,
    tdClassName: styles.handle,
  },
  {
    header: 'Telegram',
    cell: t => t.telegram_username
      ? <span>@{t.telegram_username}</span>
      : <span className={styles.dash}>—</span>,
    card: t => t.telegram_username
      ? <span className={styles.handle}>@{t.telegram_username}</span>
      : null,
    tdClassName: styles.handle,
  },
  {
    header: 'Кабінет',
    cell: t => t.user_id
      ? <span className="badge badge-completed">Активний</span>
      : <span className={styles.dash}>—</span>,
    card: t => t.user_id
      ? <span className="badge badge-completed">Кабінет</span>
      : null,
  },
]

export default function TrainersPage() {
  return (
    <RefEntityPage<Trainer>
      title="Тренери"
      addLabel="+ Додати тренера"
      archiveLabel="Архів тренерів"
      emptyMsg={MSG.empty.trainers}
      useEntity={() => useRefEntity<Trainer>('trainers', listTrainers, toggleTrainer)}
      columns={columns}
      editable
      renderModal={({ editing, onClose, onSaved }) => (
        <TrainerModal existing={editing} onClose={onClose} onSaved={onSaved} />
      )}
    />
  )
}
