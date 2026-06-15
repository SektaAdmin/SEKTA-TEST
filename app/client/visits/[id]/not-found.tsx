import CabinetHeader from '@/components/CabinetHeader'
import styles from '../../client.module.css'

export default function VisitNotFound() {
  return (
    <>
      <CabinetHeader title="Запис не знайдено" backHref="/client/visits" hideLogout />
      <div className={styles.scroll}>
        <div className={styles.visitEmptyState}>
          <p className={styles.visitEmptyTitle}>Запис не знайдено</p>
          <p className={styles.visitEmptySubtitle}>Можливо, його було видалено або посилання застаріле</p>
        </div>
      </div>
    </>
  )
}
