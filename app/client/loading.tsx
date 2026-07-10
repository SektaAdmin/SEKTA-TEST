import CabinetHeader from '@/components/CabinetHeader'
import { STUDIO } from '@/lib/studio'
import styles from './client.module.css'

/** Скелетон головної кабінету — миттєвий відгук на клік, поки SSR рахує. */
export default function ClientHomeLoading() {
  return (
    <>
      <CabinetHeader title="Особистий кабінет" address={STUDIO.address} hideLogout />
      <div className={styles.scroll}>
        <div className={`skeleton-bone ${styles.skelCard}`} style={{ height: 84 }} />
        <div style={{ marginTop: 24 }}>
          <div className={`skeleton-bone ${styles.skelBlock}`} />
          <div className={`skeleton-bone ${styles.skelBlock}`} />
          <div className={`skeleton-bone ${styles.skelBlock}`} />
        </div>
      </div>
    </>
  )
}
