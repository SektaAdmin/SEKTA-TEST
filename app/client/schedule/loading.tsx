import CabinetHeader from '@/components/CabinetHeader'
import styles from '../client.module.css'

/** Скелетон екрану «Розклад» — заголовок дня + картки занять. */
export default function ClientScheduleLoading() {
  return (
    <>
      <CabinetHeader title="Розклад" backHref="/client" hideLogout />
      <div className={styles.scroll}>
        <div className="skeleton-bone" style={{ height: 14, width: 160, marginBottom: 12 }} />
        <div className={`skeleton-bone ${styles.skelCard}`} />
        <div className={`skeleton-bone ${styles.skelCard}`} />
        <div className={`skeleton-bone ${styles.skelCard}`} />
      </div>
    </>
  )
}
