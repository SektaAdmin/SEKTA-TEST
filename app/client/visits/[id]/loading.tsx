import CabinetHeader from '@/components/CabinetHeader'
import styles from '../../client.module.css'

/** Скелетон деталей запису. Заголовок невідомий (минулий/майбутній) — нейтральний. */
export default function VisitDetailLoading() {
  return (
    <>
      <CabinetHeader title="Запис" backHref="/client/visits" hideLogout />
      <div className={styles.scroll}>
        <div className="skeleton-bone" style={{ height: 180, borderRadius: 'var(--radius)', marginBottom: 24 }} />
        <div className={`skeleton-bone ${styles.skelCard}`} />
        <div className={`skeleton-bone ${styles.skelCard}`} />
      </div>
    </>
  )
}
