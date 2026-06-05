import styles from '../loading.module.css'
import headerStyles from '../../../components/CabinetHeader.module.css'

export default function SubscriptionsLoading() {
  return (
    <div className={styles.shell}>
      <header className={headerStyles.header} style={{ padding: `calc(20px + env(safe-area-inset-top)) 16px 20px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className={styles.shimmer} style={{ width: 36, height: 36, borderRadius: 6 }} />
          <div className={styles.shimmer} style={{ width: 110, height: 20 }} />
        </div>
      </header>
      <div className={styles.scroll}>
        {/* блок балансів */}
        <div className={styles.card} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
          <div className={styles.shimmer} style={{ width: '45%', height: 24 }} />
          <div className={styles.shimmer} style={{ height: 1, borderRadius: 0 }} />
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className={styles.shimmer} style={{ width: '40%', height: 14 }} />
              <div className={styles.shimmer} style={{ width: '20%', height: 14 }} />
            </div>
          ))}
        </div>
        {/* список покупок */}
        <div className={styles.shimmer} style={{ width: 80, height: 11, marginTop: 12, marginBottom: 4 }} />
        {[1, 2, 3].map(i => (
          <div key={i} className={styles.card} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div className={styles.shimmer} style={{ width: '60%', height: 15 }} />
            <div className={styles.shimmer} style={{ width: '35%', height: 13 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
