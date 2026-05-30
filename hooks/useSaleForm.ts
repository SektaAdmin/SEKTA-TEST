'use client'
import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { fetchClientBalance } from '@/hooks/useClientBalance'
import { nowDatetimeLocal, isoToDatetimeLocal, datetimeLocalToDisplay } from '@/lib/formatters'
import { VM } from '@/lib/validation-messages'
import type { Ticket, PaymentMethod } from '@/types'
import type { EditSaleSnapshot } from '@/components/SaleModal'

export const saleSchema = z.object({
  client_id: z.string().min(1, VM.required.selectClient),
  ticket_id: z.string().optional().or(z.literal('')),
  trainer_id: z.string().optional().or(z.literal('')),
  cash_holder: z.string().optional().or(z.literal('')),
  price_paid: z.number().min(0),
  amount_given: z.number(),
  payment_method: z.enum(['cash', 'fop', 'personal_card', 'deposit']),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.ticket_id && !data.trainer_id && data.payment_method === 'cash') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: VM.required.selectTrainer, path: ['trainer_id'] })
  }
  if (!data.ticket_id && data.amount_given === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: VM.invalid.amountNonZero, path: ['amount_given'] })
  }
})

export type SaleFormValues = z.infer<typeof saleSchema>

export function resolveSubmitValues(formData: SaleFormValues) {
  const isNoTicket = !formData.ticket_id
  return {
    submitAmountGiven: isNoTicket && formData.amount_given < 0 ? 0 : formData.amount_given,
    submitPricePaid:   isNoTicket && formData.amount_given < 0 ? Math.abs(formData.amount_given) : formData.price_paid,
  }
}

export function useNumberField(initial: number) {
  const [text, setText] = useState(String(initial))
  function onChange(e: React.ChangeEvent<HTMLInputElement>, set: (n: number) => void) {
    setText(e.target.value)
    if (e.target.value === '' || e.target.value === '-') { set(0); return }
    const n = Number(e.target.value)
    if (!isNaN(n)) set(n)
  }
  function onBlur(set: (n: number) => void) {
    const n = Number(text)
    const val = text === '' || isNaN(n) ? 0 : n
    setText(String(val))
    set(val)
  }
  return { text, setText, onChange, onBlur }
}

export function useSaleForm(editSale?: EditSaleSnapshot, preselectedClientBalance?: number | null) {
  const form = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: {
      client_id: editSale?.client_id ?? '',
      ticket_id: editSale?.ticket_id ?? '',
      trainer_id: editSale?.trainer_id ?? '',
      cash_holder: editSale?.cash_holder ?? '',
      price_paid: editSale?.price_paid ?? 0,
      amount_given: editSale
        ? (editSale.ticket_id
            ? editSale.amount_given
            : (editSale.amount_given - editSale.price_paid))
        : 0,
      payment_method: editSale?.payment_method ?? 'cash',
      notes: editSale?.notes ?? '',
    },
  })

  const [clientBalance, setClientBalance] = useState<number | null>(preselectedClientBalance ?? null)
  const [ticketChanged, setTicketChanged] = useState(false)
  const [payFromDeposit, setPayFromDeposit] = useState(editSale?.payment_method === 'deposit')
  const [saleDatetime, setSaleDatetime] = useState(
    editSale ? isoToDatetimeLocal(editSale.created_at) : nowDatetimeLocal()
  )
  const [displayDatetime, setDisplayDatetime] = useState(
    datetimeLocalToDisplay(editSale ? isoToDatetimeLocal(editSale.created_at) : nowDatetimeLocal())
  )

  const pricePaid$ = useNumberField(editSale?.price_paid ?? 0)
  const amountGiven$ = useNumberField(
    editSale
      ? (editSale.ticket_id ? editSale.amount_given : (editSale.amount_given - editSale.price_paid))
      : 0
  )

  const loadClientBalance = useCallback(async (id: string) => {
    const balance = await fetchClientBalance(id)
    setClientBalance(balance ?? 0)
  }, [])

  function handleDepositToggle(on: boolean, currentPricePaid: number) {
    setPayFromDeposit(on)
    if (on) {
      form.setValue('amount_given', 0)
      amountGiven$.setText('0')
      form.setValue('payment_method', 'deposit')
    } else {
      form.setValue('amount_given', currentPricePaid)
      amountGiven$.setText(String(currentPricePaid))
      form.setValue('payment_method', 'cash')
    }
  }

  function handleTicketChange(id: string, tickets: Ticket[], currentPayFromDeposit: boolean) {
    form.setValue('ticket_id', id)
    setTicketChanged(true)
    if (!id) {
      setPayFromDeposit(false)
      form.setValue('price_paid', 0)
      form.setValue('amount_given', 0)
      form.setValue('payment_method', 'cash')
      pricePaid$.setText('0')
      amountGiven$.setText('0')
      return
    }
    const t = tickets.find(x => x.id === id)
    if (t) {
      form.setValue('price_paid', t.price)
      pricePaid$.setText(String(t.price))
      if (currentPayFromDeposit) {
        form.setValue('amount_given', 0)
        amountGiven$.setText('0')
      } else {
        form.setValue('amount_given', t.price)
        amountGiven$.setText(String(t.price))
      }
    }
  }

  return {
    form,
    clientBalance,
    setClientBalance,
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
  }
}
