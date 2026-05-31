import type { TrainerSalaryDetailRow, TrainerPayment } from '@/lib/queries/trainer-rates'
import { formatDate, formatMoney, formatTime } from '@/lib/formatters'
import { ticketTypeShortLabel, enrollmentStatusLabel, paymentLabel } from '@/lib/badges'
import { DOW_LABELS_SHORT, isoToYMD } from '@/lib/dateUtils'

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

async function loadFontAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  return res.arrayBuffer()
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

  // ── Load and register Nunito Sans (cyrillic-capable TTF from /public/fonts)
  const [regularBuf, boldBuf] = await Promise.all([
    loadFontAsArrayBuffer('/fonts/NunitoSans-Regular.ttf'),
    loadFontAsArrayBuffer('/fonts/NunitoSans-SemiBold.ttf'),
  ])

  const toBase64 = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  doc.addFileToVFS('NunitoSans-Regular.ttf', toBase64(regularBuf))
  doc.addFont('NunitoSans-Regular.ttf', 'NunitoSans', 'normal')
  doc.addFileToVFS('NunitoSans-SemiBold.ttf', toBase64(boldBuf))
  doc.addFont('NunitoSans-SemiBold.ttf', 'NunitoSans', 'bold')
  doc.setFont('NunitoSans', 'normal')

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 14

  // ── Header ──────────────────────────────────────────────────────
  doc.setFontSize(16)
  doc.setFont('NunitoSans', 'bold')
  doc.text(`Зарплата: ${opts.trainerName}`, margin, y)
  y += 7

  doc.setFontSize(10)
  doc.setFont('NunitoSans', 'normal')
  doc.setTextColor(100)
  doc.text(`Період: ${formatDate(opts.dateFrom)} – ${formatDate(opts.dateTo)}`, margin, y)
  doc.setTextColor(0)
  y += 10

  // ── Summary block ────────────────────────────────────────────────
  const summaryData = [
    ['Нараховано тренеру', `${opts.totalTrainer.toLocaleString('uk-UA')} ₴`],
    ['Готівка на руках (всього)', `${opts.cashBalanceTotal.toLocaleString('uk-UA')} ₴`],
    ['Виплачено за період', `${opts.totalPaidPeriod.toLocaleString('uk-UA')} ₴`],
    ['До виплати', `${Math.max(0, opts.toPay).toLocaleString('uk-UA')} ₴`],
  ]

  autoTable(doc, {
    startY: y,
    head: [],
    body: summaryData,
    theme: 'plain',
    styles: { font: 'NunitoSans', fontSize: 10, cellPadding: 2 },
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
    doc.setFont('NunitoSans', 'bold')
    doc.text('Заняття', margin, y)
    y += 5

    const dayGroups = buildDayGroups(opts.rows)
    const ticketTypes = Array.from(new Set(opts.rows.map(r => r.ticket_type))).sort()

    const head = [
      ['Дата / Час', ...ticketTypes.map(tt => ticketTypeShortLabel(tt)), 'Нараховано']
    ]

    const body: (string | { content: string; styles: object })[][] = []

    for (const day of dayGroups) {
      // Day header row
      body.push([
        { content: day.dateLabel, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        ...ticketTypes.map(tt => ({
          content: day.totalByType[tt] != null ? `${day.totalByType[tt]}` : '',
          styles: { fontStyle: 'bold' as const, fillColor: [240, 240, 240] as [number,number,number], halign: 'center' as const },
        })),
        {
          content: `${day.totalTrainer.toLocaleString('uk-UA')} ₴`,
          styles: { fontStyle: 'bold' as const, fillColor: [240, 240, 240] as [number,number,number], halign: 'right' as const },
        },
      ])

      for (const r of day.classes) {
        const timeLabel = `  ${formatTime(r.starts_at)}${r.hall_name ? ` · ${r.hall_name}` : ''}`
        body.push([
          timeLabel,
          ...ticketTypes.map(tt => ({
            content: tt === r.ticket_type ? `${r.total_clients}` : '',
            styles: { halign: 'center' as const },
          })),
          { content: `${r.total_trainer.toLocaleString('uk-UA')} ₴`, styles: { halign: 'right' as const } },
        ])

        for (const e of r.enrollments) {
          body.push([
            { content: `    ${e.client_name}  [${enrollmentStatusLabel(e.status)}]`, styles: { textColor: [100, 100, 100] } },
            ...ticketTypes.map(() => ({ content: '', styles: {} })),
            { content: `${e.trainer_amount.toLocaleString('uk-UA')} ₴`, styles: { textColor: [100, 100, 100] as [number,number,number], halign: 'right' as const } },
          ])
        }
      }
    }

    // Total row
    const totalByType: Record<string, number> = {}
    for (const r of opts.rows) totalByType[r.ticket_type] = (totalByType[r.ticket_type] ?? 0) + r.total_clients
    body.push([
      { content: 'Всього за період', styles: { fontStyle: 'bold', fillColor: [220, 235, 220] } },
      ...ticketTypes.map(tt => ({
        content: totalByType[tt] != null ? `${totalByType[tt]}` : '',
        styles: { fontStyle: 'bold' as const, fillColor: [220, 235, 220] as [number,number,number], halign: 'center' as const },
      })),
      {
        content: `${opts.totalTrainer.toLocaleString('uk-UA')} ₴`,
        styles: { fontStyle: 'bold' as const, fillColor: [220, 235, 220] as [number,number,number], halign: 'right' as const },
      },
    ])

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'striped',
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontSize: 9, font: 'NunitoSans' },
      styles: { fontSize: 8.5, cellPadding: 2, font: 'NunitoSans' },
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
    doc.setFont('NunitoSans', 'bold')
    doc.text('Виплати', margin, y)
    y += 5

    autoTable(doc, {
      startY: y,
      head: [['Дата', 'Тип', 'Метод', 'Період', 'Нараховано', 'Виплачено', 'Примітка']],
      body: opts.payments.map(p => [
        formatDate(p.payment_date),
        p.payment_type === 'advance' ? 'Аванс' : 'Фінальна',
        paymentLabel((p.payment_method ?? 'cash') as any),
        `${formatDate(p.period_start)} – ${formatDate(p.period_end)}`,
        `${Number(p.calculated_amount).toLocaleString('uk-UA')} ₴`,
        `${Number(p.paid_amount).toLocaleString('uk-UA')} ₴`,
        p.notes ?? '',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontSize: 9, font: 'NunitoSans' },
      styles: { fontSize: 8.5, cellPadding: 2, font: 'NunitoSans' },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin },
    })
  }

  // ── Page numbers ──────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('NunitoSans', 'normal')
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
