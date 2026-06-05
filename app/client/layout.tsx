import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import styles from './client.module.css'

export const metadata: Metadata = {
  manifest: '/manifest.json',
  // Android Chrome читає themeColor в реальному часі (маніфест — лише при встановленні)
  themeColor: '#0a0a0a',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SEKTA',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

/**
 * Layout кабінету клієнта: повна висота екрана (100dvh), щоб шапка лишалась
 * зверху, а контент скролився всередині (на мобільному html/body мають
 * overflow:hidden — документ сам не скролиться, див. globals.css).
 */
export default function ClientLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>
}
