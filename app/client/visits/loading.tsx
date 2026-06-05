import styles from '../loading.module.css'
import headerStyles from '../../../components/CabinetHeader.module.css'

export default function VisitsLoading() {
  return (
    <div className={styles.shell}>
      <header className={headerStyles.header} style={{ padding: `calc(20px + env(safe-area-inset-top)) 16px 20px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className={styles.shimmer} style={{ width: 36, height: 36, borderRadius: 6 }} />
          <div className={styles.shimmer} style={{ width: 100, height: 20 }} />
        </div>
      </header>
      <div className={styles.scroll}>
        <div className={styles.shimmer} style={{ width: 80, height: 11, marginBottom: 4 }} />
        {[1, 2].map(i => (
          <div key={i} className={styles.card} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div className={styles.shimmer} style={{ height: 36, borderRadius: 6 }} />
            <div className={styles.shimmer} style={{ width: '60%', height: 15 }} />
            <div className={styles.shimmer} style={{ width: '40%', height: 13 }} />
          </div>
        ))}
        <div className={styles.shimmer} style={{ width: 80, height: 11, marginTop: 8, marginBottom: 4 }} />
        {[1, 2, 3].map(i => (
          <div key={i} className={styles.card} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div className={styles.shimmer} style={{ height: 28, borderRadius: 6 }} />
            <div className={styles.shimmer} style={{ width: '55%', height: 15 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
