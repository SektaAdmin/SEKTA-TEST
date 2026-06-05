import CabinetHeader from '@/components/CabinetHeader'
import styles from '../client.module.css'

/** Скелетон екрану «Мої візити» — список карток-візитів. */
export default function ClientVisitsLoading() {
  return (
    <>
      <CabinetHeader title="Мої візити" backHref="/client" hideLogout />
      <div className={styles.scroll}>
        <div className={`${styles.skel}`} style={{ height: 14, width: 120, marginBottom: 12 }} />
        <div className={`${styles.skel} ${styles.skelCard}`} />
        <div className={`${styles.skel} ${styles.skelCard}`} />
        <div className={`${styles.skel} ${styles.skelCard}`} />
      </div>
    </>
  )
}
