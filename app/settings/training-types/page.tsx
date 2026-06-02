'use client'
import TrainingTypeModal from '@/components/TrainingTypeModal'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listTrainingTypes, toggleTrainingType } from '@/lib/queries/training-types'
import { MSG } from '@/lib/messages'
import { RefEntityPage, type RefColumn } from '../_RefEntityPage'
import styles from '../settings.module.css'
import type { TrainingType } from '@/types'

// Перша колонка (label) — заголовок картки, тому без card. Код — у cardMeta як бейдж.
const columns: RefColumn<TrainingType>[] = [
  { header: 'Назва', cell: t => t.label, tdClassName: styles.name },
  {
    header: 'Код',
    cell: t => <span className="badge badge-type">{t.code}</span>,
    card: t => <span className="badge badge-type">{t.code}</span>,
  },
]

export default function TrainingTypesPage() {
  return (
    <RefEntityPage<TrainingType>
      title="Типи тренувань"
      addLabel="+ Додати тип"
      archiveLabel="Архів типів"
      emptyMsg={MSG.empty.trainingTypes}
      useEntity={() => useRefEntity<TrainingType>('training_types', listTrainingTypes, toggleTrainingType)}
      columns={columns}
      editable
      renderModal={({ editing, onClose, onSaved }) => (
        <TrainingTypeModal onClose={onClose} onSaved={onSaved} existing={editing} />
      )}
    />
  )
}
