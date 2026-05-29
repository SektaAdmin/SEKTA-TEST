import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className="page-main">
        {children}
      </main>
    </div>
  )
}
