import type { ReactNode } from 'react'
import styles from './client.module.css'

/**
 * Layout кабінету клієнта: повна висота екрана (100dvh), щоб шапка лишалась
 * зверху, а контент скролився всередині (на мобільному html/body мають
 * overflow:hidden — документ сам не скролиться, див. globals.css).
 */
export default function ClientLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>
}
