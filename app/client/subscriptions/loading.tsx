import CabinetHeader from '@/components/CabinetHeader'
import styles from '../client.module.css'

/** Скелетон екрану «Абонементи». Форма точно повторює реальний layout
 *  (панель залишку занять + картки історії), щоб не було стрибка при підміні
 *  на справжній контент. Скелети-бари сидять у тих самих контейнерах
 *  (.balanceBlock / .txItem), тому паддінги й рамки збігаються з продакшеном. */
export default function ClientSubscriptionsLoading() {
  return (
    <>
      <CabinetHeader title="Абонементи" backHref="/client" hideLogout />
      <div className={styles.scroll}>
        {/* Перший .sectionLabel у реальному екрані йде ПІСЛЯ .ptrIndicator, тому
            :first-child не спрацьовує і він має повний margin-top:24px. Скелетон
            відтворює ту саму геометрію (порожній .ptrIndicator-плейсхолдер),
            щоб не було вертикального стрибка при підміні на контент. */}
        <div className={styles.ptrIndicator} style={{ height: 0 }} aria-hidden />
        <h2 className={styles.sectionLabel}>Залишок занять</h2>
        <section className={styles.balanceBlock}>
          {[64, 80, 56].map((w, i) => (
            <div key={i} className={styles.balanceRow}>
              <span className={styles.skel} style={{ height: 15, width: w, borderRadius: 4 }} />
              <span className={styles.skel} style={{ height: 26, width: 52, borderRadius: 4 }} />
            </div>
          ))}
          <div className={styles.depositRow}>
            <span className={styles.skel} style={{ height: 14, width: 56, borderRadius: 4 }} />
            <span className={styles.skel} style={{ height: 16, width: 64, borderRadius: 4 }} />
          </div>
        </section>

        <h2 className={`${styles.sectionLabel} ${styles.sectionLabelGap}`}>Історія покупок</h2>
        <ul className={styles.txList}>
          {[140, 120, 160].map((w, i) => (
            <li key={i} className={styles.txItem}>
              <div className={styles.txItemMain}>
                <div className={styles.txMain}>
                  <span className={styles.skel} style={{ display: 'block', height: 15, width: w, borderRadius: 4 }} />
                  <span className={styles.skel} style={{ display: 'block', height: 13, width: 96, marginTop: 7, borderRadius: 4 }} />
                </div>
                <span className={styles.skel} style={{ height: 16, width: 72, borderRadius: 4 }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
