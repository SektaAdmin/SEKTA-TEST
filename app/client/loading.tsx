import styles from './loading.module.css'

/** Показується миттєво (статичний HTML) поки force-dynamic page.tsx ще рендериться.
 *  Запобігає білому спалаху при старті PWA з головного екрана. */
export default function ClientLoading() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.shimmer} style={{ width: 56, height: 14 }} />
        <div className={styles.shimmer} style={{ width: 120, height: 24, marginTop: 6 }} />
      </header>
      <div className={styles.scroll}>
        {/* профіль-картка */}
        <div className={styles.card}>
          <div className={`${styles.shimmer} ${styles.avatar}`} />
          <div style={{ flex: 1 }}>
            <div className={styles.shimmer} style={{ width: '55%', height: 18 }} />
            <div className={styles.shimmer} style={{ width: '35%', height: 13, marginTop: 8 }} />
          </div>
        </div>
        {/* пункти меню */}
        <div className={styles.menuItem}>
          <div className={`${styles.shimmer} ${styles.menuIcon}`} />
          <div className={styles.shimmer} style={{ flex: 1, height: 16 }} />
        </div>
        <div className={styles.menuItem}>
          <div className={`${styles.shimmer} ${styles.menuIcon}`} />
          <div className={styles.shimmer} style={{ flex: 1, height: 16 }} />
        </div>
      </div>
    </div>
  )
}
