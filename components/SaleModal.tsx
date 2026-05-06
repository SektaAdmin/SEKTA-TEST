'use client'
import { useState, useMemo, useEffect, useId, useRef } from 'react'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useTickets } from '@/hooks/useTickets'
import { useTrainers } from '@/hooks/useTrainers'
import { useSaleForm, resolveSubmitValues } from '@/hooks/useSaleForm'
import { useSaleSubmit } from '@/hooks/useSaleSubmit'
import { formatClientLabel, parseDisplayToDatetimeLocal, datetimeLocalToDisplay } from '@/lib/formatters'
import ClientSearchCombobox from './features/ClientSearchCombobox'
import type { Client, PaymentMethod } from '@/types'
import styles from './SaleModal.module.css'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Готівка',
  fop: 'ФОП',
  personal_card: 'Особиста карта',
}

export interface EditSaleSnapshot {
  id: string
  client_id: string
  client_name: string
  ticket_id: string | null
  ticket_name: string | null
  ticket_price: number | null
  ticket_type: string | null
  sessions: number | null
  trainer_id: string | null
  trainer_name: string | null
  price_paid: number
  amount_given: number
  payment_method: PaymentMethod
  notes: string | null
  created_at: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
  editSale?: EditSaleSnapshot
  preselectedClient?: Client
}

export default function SaleModal({ onClose, onSaved, editSale, preselectedClient }: Props) {
  const isEdit = !!editSale
  const titleId = useId()
  const datePickerRef = useRef<HTMLInputElement>(null)
  const modalRef = useModalFocus(onClose)

  const { tickets, ensureTickets } = useTickets()
  const { trainers, ensureTrainers } = useTrainers()
  const [error, setError] = useState('')

  const {
    form,
    clientBalance,
    ticketChanged,
    payFromDeposit,
    saleDatetime,
    setSaleDatetime,
    displayDatetime,
    setDisplayDatetime,
    pricePaid$,
    amountGiven$,
    loadClientBalance,
    handleDepositToggle,
    handleTicketChange,
  } = useSaleForm(editSale, preselectedClient?.balance)

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = form
  const busy = isSubmitting

  const { onSubmit } = useSaleSubmit({
    editSale,
    tickets,
    ticketChanged,
    saleDatetime,
    resolveValues: resolveSubmitValues,
    onSaved,
    setError,
  })

  useEffect(() => {
    if (editSale?.client_id) loadClientBalance(editSale.client_id)
  }, [editSale?.client_id, loadClientBalance])

  const { client_id: clientId, ticket_id: ticketId, amount_given: amountGiven, price_paid: pricePaid, payment_method: payment, trainer_id: trainerId } = watch()

  const depositDelta = useMemo(() => amountGiven - pricePaid, [amountGiven, pricePaid])
  const isDeduction = !ticketId && amountGiven < 0

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId}>{isEdit ? 'Редагувати продажу' : 'Нова продажа'}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
        <div className={styles.body}>

          {/* Дата і час */}
          <div className={styles.field}>
            <label htmlFor="sale-datetime-text">Дата та час</label>
            <div className={styles.datetimeRow}>
              <input
                id="sale-datetime-text"
                type="text"
                value={displayDatetime}
                onChange={e => {
                  setDisplayDatetime(e.target.value)
                  const parsed = parseDisplayToDatetimeLocal(e.target.value)
                  if (parsed) setSaleDatetime(parsed)
                }}
                placeholder="ДД.ММ.РРРР ГГ:ХХ"
                disabled={busy}
              />
              <button
                type="button"
                className={styles.calendarBtn}
                onClick={() => {
                  try { datePickerRef.current?.showPicker() }
                  catch { datePickerRef.current?.focus() }
                }}
                disabled={busy}
                aria-label="Відкрити календар"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="3" width="14" height="12" rx="1.5"/>
                  <line x1="5" y1="1" x2="5" y2="5"/><line x1="11" y1="1" x2="11" y2="5"/>
                  <line x1="1" y1="7" x2="15" y2="7"/>
                </svg>
              </button>
              <input
                ref={datePickerRef}
                type="datetime-local"
                value={saleDatetime}
                onChange={e => {
                  setSaleDatetime(e.target.value)
                  setDisplayDatetime(datetimeLocalToDisplay(e.target.value))
                }}
                disabled={busy}
                className={styles.datetimeHidden}
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Клієнт */}
          <div className={styles.field}>
            <label htmlFor="sale-client">Клієнт</label>
            <ClientSearchCombobox
              inputId="sale-client"
              initialLabel={editSale?.client_name ?? (preselectedClient ? formatClientLabel(preselectedClient) : undefined)}
              onSelect={(client: Client) => {
                setValue('client_id', client.id)
                loadClientBalance(client.id)
              }}
              onClear={() => {
                setValue('client_id', '')
              }}
              error={errors.client_id?.message}
              disabled={busy}
            />
            {clientId && clientBalance !== null && (
              <span className={`${styles.depositHint} ${clientBalance > 0 ? styles.depositPos : clientBalance < 0 ? styles.depositNeg : styles.depositZero}`}>
                Депозит: {clientBalance > 0 ? '+' : ''}{clientBalance.toLocaleString('uk-UA')} ₴
              </span>
            )}
          </div>

          {/* Абонемент */}
          <div className={styles.field}>
            <label htmlFor="sale-ticket">Абонемент</label>
            <select
              id="sale-ticket"
              value={ticketId}
              onFocus={ensureTickets}
              onChange={e => handleTicketChange(e.target.value, tickets, payFromDeposit)}
              disabled={busy}
            >
              <option value="">— Оберіть абонемент —</option>
              {isEdit && ticketId && !tickets.find(t => t.id === ticketId) && (
                <option value={ticketId}>{editSale!.ticket_name}</option>
              )}
              {tickets.map(t => (
                <option key={t.id} value={t.id}>{t.name} — {t.price.toLocaleString('uk-UA')} ₴</option>
              ))}
            </select>
          </div>

          {/* Таб-переключатель: Звичайна оплата / Депозит */}
          <div className={styles.field}>
              <div className={styles.paymentTabs}>
                <button
                  type="button"
                  className={`${styles.paymentTab} ${!payFromDeposit ? styles.paymentTabActive : ''}`}
                  onClick={() => handleDepositToggle(false, pricePaid)}
                  disabled={busy}
                >
                  Звичайна оплата
                </button>
                <button
                  type="button"
                  className={`${styles.paymentTab} ${payFromDeposit ? styles.paymentTabActive : ''}`}
                  onClick={() => handleDepositToggle(true, pricePaid)}
                  disabled={busy}
                >
                  Депозит
                </button>
              </div>
              {payFromDeposit && clientBalance !== null && clientBalance < pricePaid && (
                <span className={`${styles.depositHint} ${styles.depositNeg}`}>
                  На депозиті {clientBalance.toLocaleString('uk-UA')} ₴ — може не вистачити
                </span>
              )}
            </div>

          {/* Спосіб оплати — кнопки */}
          {!isDeduction && !payFromDeposit && (
            <div className={styles.field}>
              <label>Спосіб оплати</label>
              <div className={styles.paymentTabs}>
                {(['cash', 'fop', 'personal_card'] as PaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`${styles.paymentTab} ${payment === method ? styles.paymentTabActive : ''}`}
                    onClick={() => setValue('payment_method', method)}
                    disabled={busy}
                  >
                    {PAYMENT_LABELS[method]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Тренер (тільки для готівки) */}
          {!isDeduction && payment === 'cash' && (
            <div className={styles.field}>
              <label htmlFor="sale-trainer">
                Тренер {ticketId && <span className={styles.required}>* обов'язково</span>}
              </label>
              <select
                id="sale-trainer"
                value={trainerId}
                onFocus={ensureTrainers}
                onChange={e => setValue('trainer_id', e.target.value)}
                disabled={busy}
              >
                <option value="">— Оберіть тренера —</option>
                {isEdit && trainerId && !trainers.find(t => t.id === trainerId) && (
                  <option value={trainerId}>{editSale!.trainer_name}</option>
                )}
                {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {errors.trainer_id && (
                <p className={styles.errorHint} role="alert">{errors.trainer_id.message}</p>
              )}
            </div>
          )}

          {/* Фактична сума */}
          {ticketId && (
            <div className={styles.field}>
              <label htmlFor="sale-price-paid">
                {payFromDeposit ? 'Сума списання (₴)' : 'Фактична сума (₴)'}
              </label>
              <input
                id="sale-price-paid"
                type="number"
                value={pricePaid$.text}
                onFocus={e => e.target.select()}
                onChange={e => pricePaid$.onChange(e, n => setValue('price_paid', n))}
                onBlur={() => pricePaid$.onBlur(n => setValue('price_paid', n))}
                min={0}
                step={1}
                disabled={busy}
              />
              {payFromDeposit && pricePaid > 0 && (
                <span className={`${styles.depositHint} ${styles.depositNeg}`}>
                  −{pricePaid.toLocaleString('uk-UA')} ₴ з депозиту
                </span>
              )}
            </div>
          )}

          {/* Сума від клієнта / операція з депозитом */}
          {!(ticketId && payFromDeposit) && <div className={styles.field}>
            <label htmlFor="sale-amount-given">
              {ticketId ? 'Сума від клієнта (₴)' : 'Сума (₴)'}
            </label>
            <input
              id="sale-amount-given"
              type="number"
              value={amountGiven$.text}
              onFocus={e => e.target.select()}
              onChange={e => amountGiven$.onChange(e, n => setValue('amount_given', n))}
              onBlur={() => amountGiven$.onBlur(n => setValue('amount_given', n))}
              min={ticketId ? 0 : undefined}
              step={1}
              disabled={busy}
            />
            {!ticketId && (
              <span className={styles.depositHint} style={{ color: 'var(--text-3)' }}>
                Позитивне — поповнення, негативне — списання
              </span>
            )}
            {ticketId && depositDelta !== 0 && (
              <span className={`${styles.depositHint} ${depositDelta > 0 ? styles.depositPos : styles.depositNeg}`}>
                {depositDelta > 0
                  ? `+${depositDelta.toLocaleString('uk-UA')} ₴ на депозит`
                  : `${depositDelta.toLocaleString('uk-UA')} ₴ з депозиту`}
              </span>
            )}
            {!ticketId && amountGiven !== 0 && (
              <span className={`${styles.depositHint} ${amountGiven > 0 ? styles.depositPos : styles.depositNeg}`}>
                {amountGiven > 0
                  ? `+${amountGiven.toLocaleString('uk-UA')} ₴ на депозит`
                  : `${amountGiven.toLocaleString('uk-UA')} ₴ з депозиту`}
              </span>
            )}
          </div>}

          {/* Коментар / Причина */}
          <div className={styles.field}>
            <label htmlFor="sale-notes">Коментар</label>
            <textarea
              id="sale-notes"
              {...register('notes')}
              placeholder={ticketId ? "Необов'язково" : 'Поповнення, виправлення помилки...'}
              rows={2}
              disabled={busy}
            />
            {errors.notes && (
              <p className={styles.errorHint} role="alert">{errors.notes.message}</p>
            )}
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" className={styles.btnSave} disabled={busy}>
            {busy ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
        </form>
      </div>
    </div>
  )
}
