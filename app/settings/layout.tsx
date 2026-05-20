import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import styles from './settings.module.css'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
