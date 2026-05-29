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

  const { tickets, trainers } = useRefs()
  const [error, setError] = useState('')

  const {
    form,
    clientBalance,
    ticketChanged,
    payFromDeposit,
    saleDatetime,
    setSaleDatetime,
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
    <form onSubmit={handleSubmit(onSubmit)}>
      <ModalShell
        title={isEdit ? 'Редагувати продажу' : 'Нова продажа'}
        onClose={onClose}
        mobileFullScreen
        modalClassName={styles.modal}
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
            onChange={e => handleTicketChange(e.target.value, tickets, payFromDeposit)}
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
              На депозиті {formatMoney(clientBalance)} — може не вистачити
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
                  {paymentLabel(method)}
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
                −{formatMoney(pricePaid)} з депозиту
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
                ? `+${formatMoney(depositDelta)} на депозит`
                : `${formatMoney(depositDelta)} з депозиту`}
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
