'use client'
import HallModal from '@/components/HallModal'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listHalls, toggleHall } from '@/lib/queries/halls'
import { MSG } from '@/lib/messages'
import { RefEntityPage, type RefColumn } from '../_RefEntityPage'
import styles from '../settings.module.css'
import type { Hall } from '@/types'

// Перша колонка — завжди заголовок картки (cardRow), тому БЕЗ card (інакше дубль у cardMeta).
const columns: RefColumn<Hall>[] = [
  { header: 'Назва', cell: h => h.name, tdClassName: styles.name },
  { header: 'Місткість', cell: h => `${h.capacity} осіб`, card: h => `${h.capacity} осіб`, tdClassName: styles.mono },
  { header: 'Опис', cell: h => h.description ?? '—', card: h => (h.description ? h.description : null), tdClassName: styles.description },
]

export default function HallsPage() {
  return (
    <RefEntityPage<Hall>
      title="Зали"
      addLabel="+ Додати зал"
      archiveLabel="Архів залів"
      emptyMsg={MSG.empty.halls}
      useEntity={() => useRefEntity<Hall>('halls', listHalls, toggleHall)}
      columns={columns}
      renderModal={({ onClose, onSaved }) => <HallModal onClose={onClose} onSaved={onSaved} />}
    />
  )
}
