'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import SaleModal from '@/components/SaleModal'
import type { Sale, PaymentMethod } from '@/types'
import styles from './sales.module.css'

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Готівка',
  fop: 'ФОП',
  personal_card: 'Особиста карта',
}

const PAYMENT_CLASS: Record<PaymentMethod, string> = {
  cash: styles.badgeCash,
  fop: styles.badgeFop,
  personal_card: styles.badgeCard,
}

export default function SalesPage() {
  const supabase = createClient()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editSale, setEditSale] = useState<Sale | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchSales = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sales')
      .select(`
        id, created_at, client_id, ticket_id, trainer_id,
        ticket_name, ticket_price, sessions, price_paid, amount_given,
        payment_method, notes,
        clients(first_name, last_name),
        tickets(name),
        trainers(name)
      `)
      .order('created_at', { ascending: false })
      .limit(200)
    setSales((data as unknown as Sale[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSales() }, [fetchSales])

  function clientName(s: Sale) {
    const { first_name, last_name } = s.clients
    return [first_name, last_name].filter(Boolean).join(' ') || '—'
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
  }

  async function handleDelete() {
  if (!deleteId) return
  setDeleting(true)
  setDeleteError('')

  const sale = sales.find(s => s.id === deleteId)

  // Отменить баланс операцию
  if (sale) {
    const delta = sale.amount_given - sale.price_paid
    
    if (delta !== 0) {
      const { error: balanceError } = await supabase.rpc('update_client_balance', {
        p_client_id: sale.client_id,
        p_amount: -delta,
        p_transaction_type: 'admin_adjustment',
        p_description: 'Скасування продажи',
        p_related_sale_id: sale.id,
      })

      if (balanceError) {
        setDeleteError('Помилка при скасуванні балансу: ' + balanceError.message)
        setDeleting(false)
        return
      }
    }
  }

  // Удалить запись
  const { error: delError } = await supabase
    .from('sales')
    .delete()
    .eq('id', deleteId)

  if (delError) {
    setDeleteError(delError.message)
    setDeleting(false)
    return
  }

  setDeleteId(null)
  setDeleting(false)
  fetchSales()
}

  function handleSaved() {
    setShowModal(false)
    setEditSale(null)
    fetchSales()
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Продажи</h1>
          <button className={styles.btnNew} onClick={() => { setEditSale(null); setShowModal(true) }}>
            + Нова продажа
          </button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : sales.length === 0 ? (
            <div className={styles.empty}>Продажів ще немає</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Клієнт</th>
                    <th>Абонемент</th>
                    <th>Сума</th>
                    <th>Депозит</th>
                    <th>Оплата</th>
                    <th>Тренер</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => {
                    const depDelta = s.amount_given - s.price_paid
                    return (
                    <tr key={s.id}>
                      <td className={styles.date}>{formatDate(s.created_at)}</td>
                      <td>{clientName(s)}</td>
                      <td>
                        {s.ticket_name ?? <span className={styles.depositLabel}>Поповнення депозиту</span>}
                      </td>
                      <td className={styles.price}>
                        {s.ticket_name ? `${s.price_paid.toLocaleString('uk-UA')} ₴` : '—'}
                      </td>
                      <td className={styles.deposit}>
                        {depDelta !== 0 ? (
                          <span className={depDelta > 0 ? styles.depositPos : styles.depositNeg}>
                            {depDelta > 0 ? '+' : ''}{depDelta.toLocaleString('uk-UA')} ₴
                          </span>
                        ) : <span className={styles.depositZero}>—</span>}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${PAYMENT_CLASS[s.payment_method]}`}>
                          {PAYMENT_LABELS[s.payment_method]}
                        </span>
                      </td>
                      <td className={styles.trainer}>{s.trainers?.name ?? '—'}</td>
                      <td>
                        <div className={styles.actions}>
                          <button className={styles.btnEdit} onClick={() => { setEditSale(s); setShowModal(true) }}>
                            Змінити
                          </button>
                          <button className={styles.btnDel} onClick={() => setDeleteId(s.id)}>
                            Видалити
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <SaleModal
          onClose={() => { setShowModal(false); setEditSale(null) }}
          onSaved={handleSaved}
          editSale={editSale ? {
            id: editSale.id,
            client_id: editSale.client_id,
            client_name: [editSale.clients?.first_name, editSale.clients?.last_name].filter(Boolean).join(' '),
            ticket_id: editSale.ticket_id,
            ticket_name: editSale.ticket_name,
            ticket_price: editSale.ticket_price,
            sessions: editSale.sessions,
            trainer_id: editSale.trainer_id,
            trainer_name: editSale.trainers?.name ?? null,
            price_paid: editSale.price_paid,
            amount_given: editSale.amount_given,
            payment_method: editSale.payment_method,
            notes: editSale.notes,
          } : undefined}
        />
      )}

      {deleteId && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <h3>Видалити продажу?</h3>
            <p>Цю дію неможливо скасувати.</p>
            {deleteError && <p className={styles.confirmError}>{deleteError}</p>}
            <div className={styles.confirmBtns}>
              <button className={styles.btnCancel} onClick={() => { setDeleteId(null); setDeleteError('') }}>Скасувати</button>
              <button className={styles.btnConfirmDel} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Видалення...' : 'Видалити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
