import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import styles from '../settings/settings.module.css'

export default function JournalLayout({ children }: { children: React.ReactNode }) {
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
