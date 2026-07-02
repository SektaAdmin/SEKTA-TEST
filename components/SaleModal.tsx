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

  const { client_id: clientId, ticket_id: ticketId, amount_given: amountGiven, price_paid: pricePaid, payment_method: payment, trainer_id: trainerId } = watch()

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
        <FormField id="sale-client" label="Клієнт">
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
        </FormField>

        {/* Стан депозиту — read-only «поле», завжди видиме. було → стане (±дельта) */}
        <FormField id="sale-deposit" label="Депозит">
          <div className={styles.depositBox}>
            {!clientId || clientBalance === null ? (
              <span className={styles.depositBoxEmpty}>Оберіть клієнта</span>
            ) : (
              <span className={`${styles.depositBoxNext} ${(clientBalance + depositDelta) < 0 ? styles.depositNeg : (clientBalance + depositDelta) > 0 ? styles.depositPos : ''}`}>
                {formatMoney(clientBalance + depositDelta)}
                {(clientBalance + depositDelta) < 0 ? ' · борг' : ''}
              </span>
            )}
          </div>
        </FormField>

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
            {tickets.filter(t => t.is_active).map(t => (
              <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.price)}</option>
            ))}
          </select>
        </FormField>

        {/* Спосіб оплати — кнопки. «З депозиту» доступна лише з абонементом. */}
        <FormField id="sale-payment" label="Спосіб оплати">
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
        </FormField>

        {/* Тренер (тільки для готівки). Цей же тренер = хто прийняв готівку (cash_holder). */}
        {payment === 'cash' && (
          <FormField
            id="sale-trainer"
            label="Тренер (прийняв готівку)"
            required={!!ticketId}
            error={errors.trainer_id}
          >
            <select
              id="sale-trainer"
              value={trainerId}
              onChange={e => setValue('trainer_id', e.target.value)}
              disabled={busy}
            >
              <option value="">— Оберіть тренера —</option>
              {isEdit && trainerId && !trainers.find(t => t.id === trainerId) && (
                <option value={trainerId}>{editSale!.trainer_name}</option>
              )}
              {trainers.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </FormField>
        )}

        {/* Ціна списання з депозиту */}
        {ticketId && fromDeposit && (
          <FormField id="sale-price-paid" label="Сума списання (₴)">
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
          </FormField>
        )}

        {/* Ціна абонемента (жива оплата) — редагований номінал */}
        {ticketId && !fromDeposit && (
          <FormField id="sale-price-paid" label="Ціна абонемента (₴)">
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
          </FormField>
        )}

        {/* Сума від клієнта (жива оплата) / операція з депозитом без абонемента */}
        {!fromDeposit && (
          <FormField
            id="sale-amount-given"
            label={ticketId ? 'Сума від клієнта (₴)' : 'Сума (₴)'}
            error={errors.amount_given}
            hint={!ticketId ? 'Позитивне — поповнення, негативне — списання' : undefined}
          >
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
          </FormField>
        )}

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
