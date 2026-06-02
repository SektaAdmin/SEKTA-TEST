import { redirect } from 'next/navigation'

/**
 * Деталі заняття більше не окрема сторінка — це ClassDetailModal (відкривається
 * з /schedule, /journal, картки клієнта, дашборду). Старі URL-и /schedule/<id>
 * (закладки, поширені посилання) ведемо на розклад.
 */
export default function ClassDetailPage() {
  redirect('/schedule')
}
