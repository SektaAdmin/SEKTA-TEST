import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import { RefsProvider } from '@/contexts/RefsContext'
import './globals.css'

// Inter (variable) — кирилиця є; Geist кирилиці не має, тому не підходить (UI українською).
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Sekta CRM',
  description: 'CRM система для студії танців',
  // Safari iOS автоматично перетворює телефони/email/адреси на посилання —
  // вимикаємо, щоб текст залишався звичайним текстом (кабінет клієнта).
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    apple: '/icons/icon-192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={inter.variable}>
      {/* background вшито inline щоб фон з'явився до завантаження globals.css —
          прибирає білий спалах при старті PWA (сервер повертає HTML з фоном одразу).
          Значення = --bg із globals.css, міняти синхронно. */}
      <body style={{ background: '#f6f7f9' }}>
        <RefsProvider>{children}</RefsProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  )
}
