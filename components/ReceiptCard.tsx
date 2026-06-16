'use client'
import { forwardRef } from 'react'
import { formatMoney, formatClientName } from '@/lib/formatters'
import { paymentLabel } from '@/lib/badges'
import type { Sale, SessionBalance } from '@/lib/queries/sales'

interface ReceiptCardProps {
  sale: Sale
  balances: SessionBalance[]
  labelMap: Record<string, string>
}

const ReceiptCard = forwardRef<HTMLDivElement, ReceiptCardProps>(
  ({ sale, balances, labelMap }, ref) => {
    const clientName = formatClientName(sale.clients)
    const depDelta = sale.amount_given - sale.price_paid
    const isDeposit = !sale.ticket_id

    const operationLabel = sale.ticket_name
      ? sale.ticket_name
      : depDelta >= 0 ? 'Поповнення депозиту' : 'Списання з депозиту'

    const receiptDate = new Date(sale.created_at).toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Kyiv',
    })

    const amount = isDeposit ? Math.abs(depDelta) : sale.price_paid
    const nonZeroBalances = balances.filter(b => b.sessions_balance !== 0)

    const rowStyle: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '9px 0',
      borderBottom: '1px solid #f2f2f2',
    }
    const labelStyle: React.CSSProperties = {
      fontSize: 14,
      color: '#888',
      flexShrink: 0,
      marginRight: 16,
    }
    const valueStyle: React.CSSProperties = {
      fontSize: 14,
      color: '#111',
      fontWeight: 500,
      textAlign: 'right',
    }

    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          left: -9999,
          top: 0,
          width: 400,
          backgroundColor: '#ffffff',
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          padding: '36px 32px 32px',
          borderRadius: 20,
          boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
        }}
      >
        {/* Іконка статусу */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: '#22c55e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 4 }}>
            Платіж успішний
          </div>
          {sale.receipt_number != null && (
            <div style={{ fontSize: 12, color: '#aaa' }}>
              Квитанція № {String(sale.receipt_number).padStart(5, '0')}
            </div>
          )}
        </div>

        {/* Таблиця деталей */}
        <div style={{ borderTop: '1px solid #f2f2f2' }}>
          <div style={rowStyle}>
            <span style={labelStyle}>Відправник</span>
            <span style={valueStyle}>{clientName}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Сума</span>
            <span style={{ ...valueStyle, fontSize: 16, fontWeight: 700 }}>{formatMoney(amount)}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Дата</span>
            <span style={valueStyle}>{receiptDate}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Призначення</span>
            <span style={valueStyle}>{operationLabel}</span>
          </div>
          {!isDeposit && (
            <div style={{ ...rowStyle, borderBottom: nonZeroBalances.length > 0 ? '1px solid #f2f2f2' : 'none' }}>
              <span style={labelStyle}>Метод оплати</span>
              <span style={valueStyle}>{paymentLabel(sale.payment_method)}</span>
            </div>
          )}
        </div>

        {/* Після оплати */}
        {nonZeroBalances.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Після оплати
            </div>
            {nonZeroBalances.map((b, i) => (
              <div
                key={b.ticket_type}
                style={{
                  ...rowStyle,
                  borderBottom: i < nonZeroBalances.length - 1 ? '1px solid #f2f2f2' : 'none',
                }}
              >
                <span style={labelStyle}>{labelMap[b.ticket_type] ?? b.ticket_type}</span>
                <span style={{
                  ...valueStyle,
                  color: b.sessions_balance > 0 ? '#16a34a' : '#dc2626',
                }}>
                  {b.sessions_balance} год
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
)
ReceiptCard.displayName = 'ReceiptCard'
export default ReceiptCard
