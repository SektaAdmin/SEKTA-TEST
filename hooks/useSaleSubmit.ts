'use client'
import { supabase } from '@/lib/supabase'
import { createSale, updateSale, getTicketById } from '@/lib/queries/sales'
import type { SaleFormValues, resolveSubmitValues } from '@/hooks/useSaleForm'
import type { EditSaleSnapshot } from '@/components/SaleModal'
import type { Ticket } from '@/types'

interface SubmitOptions {
  editSale?: EditSaleSnapshot
  tickets: Ticket[]
  ticketChanged: boolean
  saleDatetime: string
  resolveValues: typeof resolveSubmitValues
  onSaved: () => void
  setError: (msg: string) => void
}

export function useSaleSubmit({
  editSale,
  tickets,
  ticketChanged,
  saleDatetime,
  resolveValues,
  onSaved,
  setError,
}: SubmitOptions) {
  const isEdit = !!editSale

  async function onSubmit(formData: SaleFormValues) {
    setError('')
    const { submitAmountGiven, submitPricePaid } = resolveValues(formData)

    if (isEdit) {
      let ticketName: string | null = null
      let ticketPrice = 0
      let sessions = 0
      let ticketType: string | null = null

      if (formData.ticket_id) {
        const t = tickets.find(x => x.id === formData.ticket_id)
        if (t) {
          ticketName = t.name; ticketPrice = t.price; sessions = t.sessions; ticketType = t.ticket_type
        } else if (!ticketChanged && editSale!.ticket_name != null) {
          ticketName = editSale!.ticket_name
          ticketPrice = editSale!.ticket_price ?? 0
          sessions = editSale!.sessions ?? 0
          ticketType = editSale!.ticket_type ?? null
        } else {
          const { data: td } = await getTicketById(supabase, formData.ticket_id)
          if (!td) { setError('Абонемент не знайдено'); return }
          ticketName = td.name; ticketPrice = td.price; sessions = td.sessions; ticketType = td.ticket_type
        }
      }

      const { success, error } = await updateSale(supabase, {
        p_sale_id:        editSale!.id,
        p_client_id:      formData.client_id,
        p_ticket_id:      formData.ticket_id || null,
        p_trainer_id:     formData.trainer_id || null,
        p_cash_holder:    formData.payment_method === 'cash' ? (formData.trainer_id || null) : null,
        p_ticket_name:    ticketName,
        p_ticket_price:   ticketPrice,
        p_sessions:       sessions,
        p_ticket_type:    ticketType,
        p_price_paid:     submitPricePaid,
        p_amount_given:   submitAmountGiven,
        p_payment_method: formData.payment_method,
        p_notes:          formData.notes?.trim() || '',
        p_created_at:     new Date(saleDatetime).toISOString(),
      })

      if (!success) { setError(error ?? 'Помилка збереження'); return }

      onSaved()
      return
    }

    const { success, error } = await createSale(supabase, {
      p_client_id:      formData.client_id,
      p_ticket_id:      formData.ticket_id || null,
      p_trainer_id:     formData.trainer_id || null,
      p_cash_holder:    formData.payment_method === 'cash' ? (formData.trainer_id || null) : null,
      p_price_paid:     submitPricePaid,
      p_amount_given:   submitAmountGiven,
      p_payment_method: formData.payment_method,
      p_notes:          formData.notes?.trim() || '',
      p_created_at:     new Date(saleDatetime).toISOString(),
    })

    if (!success) { setError(error ?? 'Помилка збереження'); return }

    onSaved()
  }

  return { onSubmit }
}
