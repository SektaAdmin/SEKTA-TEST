import CabinetHeader from '@/components/CabinetHeader'
import styles from '../client.module.css'

/** Скелетон екрану «Абонементи» — блок балансу + список покупок. */
export default function ClientSubscriptionsLoading() {
  return (
    <>
      <CabinetHeader title="Абонементи" backHref="/client" hideLogout />
      <div className={styles.scroll}>
        <div className={`${styles.skel}`} style={{ height: 140, borderRadius: 'var(--radius)', marginBottom: 24 }} />
        <div className={`${styles.skel}`} style={{ height: 14, width: 120, marginBottom: 12 }} />
        <div className={`${styles.skel} ${styles.skelCard}`} />
        <div className={`${styles.skel} ${styles.skelCard}`} />
      </div>
    </>
  )
}
