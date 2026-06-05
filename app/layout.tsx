import type { Metadata, Viewport } from 'next'
import { Nunito_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import { RefsProvider } from '@/contexts/RefsContext'
import './globals.css'

const nunitoSans = Nunito_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-nunito',
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
    <html lang="uk" className={nunitoSans.variable}>
      {/* background вшито inline щоб фон з'явився до завантаження globals.css —
          прибирає білий спалах при старті PWA (сервер повертає HTML з фоном одразу). */}
      <body style={{ background: '#f5f5f2' }}>
        <RefsProvider>{children}</RefsProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  )
}
