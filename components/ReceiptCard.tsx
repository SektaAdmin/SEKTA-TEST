'use client'
import { forwardRef } from 'react'
import { STUDIO } from '@/lib/studio'
import { formatMoney, formatClientName } from '@/lib/formatters'
import { paymentLabel } from '@/lib/badges'
import type { Sale, SessionBalance } from '@/lib/queries/sales'

interface ReceiptCardProps {
  sale: Sale
  balances: SessionBalance[]
  labelMap: Record<string, string>
}

/** Рендериться поза viewport — html2canvas захоплює для PNG. */
const ReceiptCard = forwardRef<HTMLDivElement, ReceiptCardProps>(
  ({ sale, balances, labelMap }, ref) => {
    const clientName = formatClientName(sale.clients)
    const depDelta = sale.amount_given - sale.price_paid
    const isDeposit = !sale.ticket_id

    const operationLabel = sale.ticket_name
      ? sale.ticket_name
      : depDelta >= 0
        ? 'Поповнення депозиту'
        : 'Списання з депозиту'

    const receiptDate = new Date(sale.created_at).toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Kyiv',
    })

    const nonZeroBalances = balances.filter(b => b.sessions_balance !== 0)

    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          left: -9999,
          top: 0,
          width: 480,
          backgroundColor: '#ffffff',
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          color: '#111111',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* Шапка */}
        <div style={{ background: '#000000', padding: '28px 32px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.12em', color: '#ffffff' }}>
              {STUDIO.name}
            </span>
            {sale.receipt_number != null && (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 500, letterSpacing: '0.04em' }}>
                № {String(sale.receipt_number).padStart(5, '0')}
              </span>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.02em' }}>
            {STUDIO.address}
          </div>
        </div>

        {/* Статус */}
        <div style={{
          background: '#16a34a',
          padding: '10px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 16, color: '#ffffff' }}>✓</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', letterSpacing: '0.03em' }}>
            Оплату підтверджено
          </span>
        </div>

        {/* Тіло */}
        <div style={{ padding: '24px 32px' }}>
          {/* Клієнт + дата */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Клієнт</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{clientName}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Дата</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{receiptDate}</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: 20 }} />

          {/* Операція — тільки назва, без кількості занять */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Операція</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{operationLabel}</div>
          </div>

          {/* Сума */}
          <div style={{
            background: '#f8f8f8',
            borderRadius: 10,
            padding: '14px 18px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>
              {isDeposit ? (depDelta >= 0 ? 'Сума поповнення' : 'Сума списання') : 'Сума оплати'}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {isDeposit ? formatMoney(Math.abs(depDelta)) : formatMoney(sale.price_paid)}
            </span>
          </div>

          {/* Метод оплати */}
          {!isDeposit && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#888' }}>Метод оплати</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{paymentLabel(sale.payment_method)}</span>
            </div>
          )}

          {/* Δ депозит */}
          {depDelta !== 0 && !isDeposit && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#888' }}>Зміна депозиту</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: depDelta > 0 ? '#16a34a' : '#dc2626' }}>
                {depDelta > 0 ? '+' : ''}{formatMoney(depDelta)}
              </span>
            </div>
          )}

          {/* Залишок занять — людська назва типу з labelMap */}
          {nonZeroBalances.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid #f0f0f0', margin: '16px 0 14px' }} />
              <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Залишок занять
              </div>
              {nonZeroBalances.map(b => (
                <div key={b.ticket_type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#555' }}>
                    {labelMap[b.ticket_type] ?? b.ticket_type}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: b.sessions_balance > 0 ? '#16a34a' : '#dc2626' }}>
                    {b.sessions_balance} год
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    )
  }
)
ReceiptCard.displayName = 'ReceiptCard'
export default ReceiptCard
