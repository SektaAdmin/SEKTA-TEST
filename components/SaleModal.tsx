'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRefs } from '@/contexts/RefsContext'
import { useSaleForm, resolveSubmitValues } from '@/hooks/useSaleForm'
import { useSaleSubmit } from '@/hooks/useSaleSubmit'
import { formatClientLabel } from '@/lib/formatters'
import { paymentLabel } from '@/lib/badges'
import { formatMoney } from '@/lib/formatters'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import ClientSearchCombobox from './features/ClientSearchCombobox'
import DateTimePicker from './DateTimePicker'
import type { Client, PaymentMethod } from '@/types'
import styles from './SaleModal.module.css'

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
  cash_holder: string | null
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

// Способи оплати «живими» грошима (готівка/ФОП/картка). 'deposit' — окремо, лише з абонементом.
const LIVE_METHODS: PaymentMethod[] = ['cash', 'fop', 'personal_card']

export default function SaleModal({ onClose, onSaved, editSale, preselectedClient }: Props) {
  const isEdit = !!editSale

  const { tickets, trainers } = useRefs()
  const [error, setError] = useState('')

  const {
    form,
    clientBalance,
    ticketChanged,
    saleDatetime,
    setSaleDatetime,
    pricePaid$,
    amountGiven$,
    loadClientBalance,
    handlePaymentMethodChange,
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

  const { client_id: clientId, ticket_id: ticketId, amount_given: amountGiven, price_paid: pricePaid, payment_method: payment, trainer_id: trainerId, cash_holder: cashHolder } = watch()

  const fromDeposit = payment === 'deposit'
  const depositDelta = useMemo(() => amountGiven - pricePaid, [amountGiven, pricePaid])

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <ModalShell
        title={isEdit ? 'Редагувати продажу' : 'Нова продажа'}
        onClose={onClose}
        footer={
          <ModalFooter
            onCancel={onClose}
            onSave={handleSubmit(onSubmit)}
            loading={busy}
            saveType="submit"
          />
        }
      >
        {/* Дата і час */}
        <FormField id="sale-datetime" label="Дата та час">
          <DateTimePicker
            value={saleDatetime}
            onChange={setSaleDatetime}
            disabled={busy}
          />
        </FormField>

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
              Депозит: {clientBalance > 0 ? '+' : ''}{formatMoney(clientBalance)}
            </span>
          )}
        </div>

        {/* Абонемент */}
        <FormField id="sale-ticket" label="Абонемент">
          <select
            id="sale-ticket"
            value={ticketId}
            onChange={e => handleTicketChange(e.target.value, tickets)}
            disabled={busy}
          >
            <option value="">— Оберіть абонемент —</option>
            {isEdit && ticketId && !tickets.find(t => t.id === ticketId) && (
              <option value={ticketId}>{editSale!.ticket_name}</option>
            )}
            {tickets.map(t => (
              <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.price)}</option>
            ))}
          </select>
        </FormField>

        {/* Спосіб оплати — кнопки. «З депозиту» доступна лише з абонементом. */}
        <div className={styles.field}>
          <label>Спосіб оплати</label>
          <div className={styles.paymentTabs}>
            {LIVE_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                className={`${styles.paymentTab} ${payment === method ? styles.paymentTabActive : ''}`}
                onClick={() => handlePaymentMethodChange(method, pricePaid)}
                disabled={busy}
              >
                {paymentLabel(method)}
              </button>
            ))}
            {ticketId && (
              <button
                type="button"
                className={`${styles.paymentTab} ${fromDeposit ? styles.paymentTabActive : ''}`}
                onClick={() => handlePaymentMethodChange('deposit', pricePaid)}
                disabled={busy}
              >
                {paymentLabel('deposit')}
              </button>
            )}
          </div>
          {fromDeposit && clientBalance !== null && clientBalance < pricePaid && (
            <span className={`${styles.depositHint} ${styles.depositNeg}`}>
              На депозиті {formatMoney(clientBalance)} — може не вистачити
            </span>
          )}
        </div>

        {/* Тренер (тільки для готівки) */}
        {payment === 'cash' && (
          <div className={styles.field}>
            <label htmlFor="sale-trainer">
              Тренер {ticketId && <span className={styles.required}>* обов'язково</span>}
            </label>
            <select
              id="sale-trainer"
              value={trainerId}
              onChange={e => {
                setValue('trainer_id', e.target.value)
                if (!cashHolder) setValue('cash_holder', e.target.value)
              }}
              disabled={busy}
            >
              <option value="">— Оберіть тренера —</option>
              {isEdit && trainerId && !trainers.find(t => t.id === trainerId) && (
                <option value={trainerId}>{editSale!.trainer_name}</option>
              )}
              {trainers.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {errors.trainer_id && (
              <p className={styles.errorHint} role="alert">{errors.trainer_id.message}</p>
            )}
          </div>
        )}

        {/* Хто прийняв готівку */}
        {payment === 'cash' && (
          <div className={styles.field}>
            <label htmlFor="sale-cash-holder">Хто прийняв готівку</label>
            <select
              id="sale-cash-holder"
              value={cashHolder}
              onChange={e => setValue('cash_holder', e.target.value)}
              disabled={busy}
            >
              <option value="">— Оберіть —</option>
              {trainers.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Ціна списання з депозиту */}
        {ticketId && fromDeposit && (
          <div className={styles.field}>
            <label htmlFor="sale-price-paid">Сума списання (₴)</label>
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
            {pricePaid > 0 && (
              <span className={`${styles.depositHint} ${styles.depositNeg}`}>
                −{formatMoney(pricePaid)} з депозиту
              </span>
            )}
          </div>
        )}

        {/* Ціна абонемента (жива оплата) — редагований номінал */}
        {ticketId && !fromDeposit && (
          <div className={styles.field}>
            <label htmlFor="sale-price-paid">Ціна абонемента (₴)</label>
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
          </div>
        )}

        {/* Сума від клієнта (жива оплата) / операція з депозитом без абонемента */}
        {!fromDeposit && <div className={styles.field}>
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
          {errors.amount_given && (
            <p className={styles.errorHint} role="alert">{errors.amount_given.message}</p>
          )}
          {!ticketId && (
            <span className={styles.depositHint} style={{ color: 'var(--text-3)' }}>
              Позитивне — поповнення, негативне — списання
            </span>
          )}
          {ticketId && depositDelta !== 0 && (
            <span className={`${styles.depositHint} ${depositDelta > 0 ? styles.depositPos : styles.depositNeg}`}>
              {depositDelta > 0
                ? `+${formatMoney(depositDelta)} на депозит`
                : `${formatMoney(depositDelta)} (борг / з депозиту)`}
            </span>
          )}
          {!ticketId && amountGiven !== 0 && (
            <span className={`${styles.depositHint} ${amountGiven > 0 ? styles.depositPos : styles.depositNeg}`}>
              {amountGiven > 0
                ? `+${formatMoney(amountGiven)} на депозит`
                : `${formatMoney(amountGiven)} з депозиту`}
            </span>
          )}
        </div>}

        {/* Коментар / Причина */}
        <FormField id="sale-notes" label="Коментар" error={errors.notes}>
          <textarea
            id="sale-notes"
            {...register('notes')}
            placeholder={ticketId ? "Необов'язково" : 'Поповнення, виправлення помилки...'}
            rows={2}
            disabled={busy}
          />
        </FormField>

        {error && <p className={styles.error} role="alert">{error}</p>}
      </ModalShell>
    </form>
  )
}
