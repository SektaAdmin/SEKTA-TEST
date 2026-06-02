'use client'
import { useMemo } from 'react'
import TicketModal from '@/components/TicketModal'
import { useRefEntity } from '@/hooks/useRefEntity'
import { listTickets, toggleTicket } from '@/lib/queries/tickets'
import { useRefs } from '@/contexts/RefsContext'
import { formatMoney } from '@/lib/formatters'
import { MSG } from '@/lib/messages'
import { RefEntityPage, type RefColumn } from '../_RefEntityPage'
import styles from '../settings.module.css'
import type { Ticket } from '@/types'

export default function TicketsPage() {
  const { trainingTypes } = useRefs()
  const typeLabel = (code: string) => trainingTypes.find(t => t.code === code)?.label ?? code

  const columns: RefColumn<Ticket>[] = useMemo(() => [
    { header: 'Назва', cell: t => t.name, tdClassName: styles.name },
    {
      header: 'Тип',
      cell: t => <span className="badge badge-type">{typeLabel(t.ticket_type)}</span>,
      card: t => <span className="badge badge-type">{typeLabel(t.ticket_type)}</span>,
    },
    {
      header: 'Занять',
      cell: t => t.sessions,
      card: t => `${t.sessions} занять`,
      tdClassName: styles.mono,
    },
    {
      header: 'Ціна',
      cell: t => formatMoney(t.price),
      card: t => formatMoney(t.price),
      tdClassName: styles.mono,
    },
  ], [trainingTypes])

  return (
    <RefEntityPage<Ticket>
      title="Абонементи"
      addLabel="+ Додати абонемент"
      archiveLabel="Архів абонементів"
      emptyMsg={MSG.empty.tickets}
      useEntity={() => useRefEntity<Ticket>('tickets', listTickets, toggleTicket)}
      columns={columns}
      renderModal={({ onClose, onSaved }) => <TicketModal onClose={onClose} onSaved={onSaved} />}
    />
  )
}
