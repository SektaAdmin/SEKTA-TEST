import type { TrainerSalaryDetailRow, TrainerPayment } from '@/lib/queries/trainer-rates'
import { formatDate, formatMoney, formatTime } from '@/lib/formatters'
import { ticketTypeShortLabel, enrollmentStatusLabel, paymentLabel } from '@/lib/badges'
import { DOW_LABELS_SHORT } from '@/lib/dateUtils'
import { isoToYMD } from '@/lib/dateUtils'

type DayGroup = {
  dateKey: string
  dateLabel: string
  classes: TrainerSalaryDetailRow[]
  totalByType: Record<string, number>
  totalTrainer: number
}

function buildDayGroups(rows: TrainerSalaryDetailRow[]): DayGroup[] {
  const map = new Map<string, DayGroup>()
  for (const r of rows) {
    const dateKey = isoToYMD(r.starts_at)
    if (!map.has(dateKey)) {
      const d = new Date(r.starts_at)
      const dow = DOW_LABELS_SHORT[d.getDay()]
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      map.set(dateKey, {
        dateKey,
        dateLabel: `${dow} ${dd}.${mm}.${yyyy}`,
        classes: [],
        totalByType: {},
        totalTrainer: 0,
      })
    }
    const group = map.get(dateKey)!
    group.classes.push(r)
    group.totalByType[r.ticket_type] = (group.totalByType[r.ticket_type] ?? 0) + r.total_clients
    group.totalTrainer += r.total_trainer
  }
  return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

export async function exportSalaryPdf(opts: {
  trainerName: string
  dateFrom: string
  dateTo: string
  rows: TrainerSalaryDetailRow[]
  payments: TrainerPayment[]
  totalTrainer: number
  totalPaidPeriod: number
  cashBalanceTotal: number
  toPay: number
}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // ── Font fallback: use built-in helvetica, transliterate Ukrainian to latin
  // jsPDF standard fonts don't support Cyrillic — we use a transliteration map
  const CYR: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'h','д':'d','е':'e','є':'ye','ж':'zh','з':'z',
    'и':'y','і':'i','ї':'yi','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
    'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch',
    'ш':'sh','щ':'shch','ь':"'",'ю':'yu','я':'ya',
    'А':'A','Б':'B','В':'V','Г':'H','Д':'D','Е':'E','Є':'Ye','Ж':'Zh','З':'Z',
    'И':'Y','І':'I','Ї':'Yi','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O',
    'П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch',
    'Ш':'Sh','Щ':'Shch','Ь':"'",'Ю':'Yu','Я':'Ya',
  }
  const t = (s: string) => s.replace(/[а-яА-ЯіІїЇєЄґҐ]/g, c => CYR[c] ?? c)

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 14

  // ── Header ──────────────────────────────────────────────────────
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(t(`Zarplata: ${opts.trainerName}`), margin, y)
  y += 7

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(t(`Period: ${formatDate(opts.dateFrom)} – ${formatDate(opts.dateTo)}`), margin, y)
  doc.setTextColor(0)
  y += 10

  // ── Summary block ────────────────────────────────────────────────
  const summaryData = [
    [t('Narakhovano (accrued)'), opts.totalTrainer > 0 ? `+${opts.totalTrainer.toLocaleString('uk-UA')} grn` : `${opts.totalTrainer.toLocaleString('uk-UA')} grn`],
    [t('Gotivka na rukakh (cash on hand)'), `${opts.cashBalanceTotal.toLocaleString('uk-UA')} grn`],
    [t('Vyplaceno za period (paid in period)'), `${opts.totalPaidPeriod.toLocaleString('uk-UA')} grn`],
    [t('Do vyplaty (to pay)'), `${Math.max(0, opts.toPay).toLocaleString('uk-UA')} grn`],
  ]

  autoTable(doc, {
    startY: y,
    head: [],
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 90, textColor: [80, 80, 80] },
      1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // ── Classes table ─────────────────────────────────────────────────
  if (opts.rows.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(t('Zanyattya (Classes)'), margin, y)
    y += 5

    const dayGroups = buildDayGroups(opts.rows)
    const ticketTypes = Array.from(new Set(opts.rows.map(r => r.ticket_type))).sort()

    const head = [
      [t('Data / Chas'), ...ticketTypes.map(tt => ticketTypeShortLabel(tt)), t('Narakhovano')]
    ]

    const body: (string | { content: string; styles: object })[][] = []

    for (const day of dayGroups) {
      // Day header row
      body.push([
        { content: t(day.dateLabel), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        ...ticketTypes.map(tt => ({
          content: day.totalByType[tt] != null ? `${day.totalByType[tt]}` : '',
          styles: { fontStyle: 'bold' as const, fillColor: [240, 240, 240] as [number,number,number], halign: 'center' as const },
        })),
        {
          content: `${day.totalTrainer.toLocaleString('uk-UA')}`,
          styles: { fontStyle: 'bold' as const, fillColor: [240, 240, 240] as [number,number,number], halign: 'right' as const },
        },
      ])

      for (const r of day.classes) {
        const timeLabel = `  ${formatTime(r.starts_at)}${r.hall_name ? ` · ${r.hall_name}` : ''}`
        body.push([
          t(timeLabel),
          ...ticketTypes.map(tt => ({
            content: tt === r.ticket_type ? `${r.total_clients}` : '',
            styles: { halign: 'center' as const },
          })),
          { content: `${r.total_trainer.toLocaleString('uk-UA')}`, styles: { halign: 'right' as const } },
        ])

        for (const e of r.enrollments) {
          body.push([
            { content: `    ${t(e.client_name)}  [${t(enrollmentStatusLabel(e.status))}]`, styles: { textColor: [100, 100, 100] } },
            ...ticketTypes.map(() => ({ content: '', styles: {} })),
            { content: `${e.trainer_amount.toLocaleString('uk-UA')}`, styles: { textColor: [100, 100, 100] as [number,number,number], halign: 'right' as const } },
          ])
        }
      }
    }

    // Total row
    const totalByType: Record<string, number> = {}
    for (const r of opts.rows) totalByType[r.ticket_type] = (totalByType[r.ticket_type] ?? 0) + r.total_clients
    body.push([
      { content: t('Vsogo za period (Total)'), styles: { fontStyle: 'bold', fillColor: [220, 235, 220] } },
      ...ticketTypes.map(tt => ({
        content: totalByType[tt] != null ? `${totalByType[tt]}` : '',
        styles: { fontStyle: 'bold' as const, fillColor: [220, 235, 220] as [number,number,number], halign: 'center' as const },
      })),
      {
        content: `${opts.totalTrainer.toLocaleString('uk-UA')}`,
        styles: { fontStyle: 'bold' as const, fillColor: [220, 235, 220] as [number,number,number], halign: 'right' as const },
      },
    ])

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'striped',
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        ...Object.fromEntries(ticketTypes.map((_, i) => [i + 1, { cellWidth: 18, halign: 'center' }])),
        [ticketTypes.length + 1]: { cellWidth: 28, halign: 'right' },
      },
      margin: { left: margin, right: margin },
    })

    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Payments table ────────────────────────────────────────────────
  if (opts.payments.length > 0) {
    if (y > 240) { doc.addPage(); y = 14 }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(t('Vyplaty (Payments)'), margin, y)
    y += 5

    autoTable(doc, {
      startY: y,
      head: [[t('Data'), t('Typ'), t('Metod'), t('Period'), t('Narakhovano'), t('Vyplaceno'), t('Prymitka')]],
      body: opts.payments.map(p => [
        formatDate(p.payment_date),
        t(p.payment_type === 'advance' ? 'Avans' : 'Final'),
        t(paymentLabel((p.payment_method ?? 'cash') as any)),
        `${formatDate(p.period_start)} – ${formatDate(p.period_end)}`,
        `${Number(p.calculated_amount).toLocaleString('uk-UA')}`,
        `${Number(p.paid_amount).toLocaleString('uk-UA')}`,
        p.notes ?? '',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontSize: 9 },
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin },
    })

    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ── Footer ────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `${i} / ${pageCount}`,
      pageW - margin,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' }
    )
  }

  const fileName = `salary_${opts.trainerName.replace(/\s+/g, '_')}_${opts.dateFrom}_${opts.dateTo}.pdf`
  doc.save(fileName)
}
