import type { TrainerSalaryDetailRow, TrainerPayment, TrainerCashBalance } from '@/lib/queries/trainer-rates'
import { formatDate, formatTime } from '@/lib/formatters'
import { ticketTypeShortLabel, paymentLabel } from '@/lib/badges'
import { DOW_LABELS_SHORT, isoToYMD } from '@/lib/dateUtils'

type DayGroup = {
  dateKey: string
  dateLabel: string
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
      map.set(dateKey, { dateKey, dateLabel: `${dow} ${dd}.${mm}.${yyyy}`, totalByType: {}, totalTrainer: 0 })
    }
    const group = map.get(dateKey)!
    group.totalByType[r.ticket_type] = (group.totalByType[r.ticket_type] ?? 0) + r.total_clients
    group.totalTrainer += r.total_trainer
  }
  return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

async function loadFont(url: string): Promise<string> {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function exportSalaryPdf(opts: {
  trainerName: string
  dateFrom: string
  dateTo: string
  rows: TrainerSalaryDetailRow[]
  payments: TrainerPayment[]
  cashBalance: TrainerCashBalance | null
  totalTrainer: number
  totalPaidPeriod: number
  cashBalanceTotal: number
  toPay: number
}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const [regularB64, boldB64] = await Promise.all([
    loadFont('/fonts/Geist-Regular.ttf'),
    loadFont('/fonts/Geist-SemiBold.ttf'),
  ])
  doc.addFileToVFS('Geist-Regular.ttf', regularB64)
  doc.addFont('Geist-Regular.ttf', 'Geist', 'normal')
  doc.addFileToVFS('Geist-SemiBold.ttf', boldB64)
  doc.addFont('Geist-SemiBold.ttf', 'Geist', 'bold')
  doc.setFont('Geist', 'normal')

  // A4 landscape: 297 × 210 mm
  const pageW = 297
  const pageH = 210
  const mL = 10   // left margin
  const mR = 10   // right margin
  const mT = 10   // top margin

  // ── Palette ──────────────────────────────────────────────────────
  const colDayBg:   [number, number, number] = [235, 235, 235]
  const colTotalBg: [number, number, number] = [210, 232, 210]
  const colHead:    [number, number, number] = [55,  55,  55]
  const colGray:    [number, number, number] = [110, 110, 110]
  const colGreen:   [number, number, number] = [30,  130, 60]
  const colRed:     [number, number, number] = [180, 40,  40]

  // ── Column widths ─────────────────────────────────────────────────
  const dayGroups  = buildDayGroups(opts.rows)
  const ticketTypes = Array.from(new Set(opts.rows.map(r => r.ticket_type))).sort()

  // Layout split: classes table left | cash table right
  // Cash table width: fixed 88mm (date 28 + desc auto + amt 22 + padding)
  const cashW   = opts.cashBalance ? 88 : 0
  const gap     = opts.cashBalance ? 5  : 0
  const classW  = pageW - mL - mR - cashW - gap

  // Within classes table: date col auto, type cols 20mm each, amt col 26mm
  const typeColW = 20
  const amtColW  = 26
  const dateColW = classW - ticketTypes.length * typeColW - amtColW

  let y = mT

  // ── Header row ───────────────────────────────────────────────────
  doc.setFont('Geist', 'bold')
  doc.setFontSize(14)
  doc.text(`Зарплата: ${opts.trainerName}`, mL, y)

  doc.setFont('Geist', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...colGray)
  doc.text(`Період: ${formatDate(opts.dateFrom)} – ${formatDate(opts.dateTo)}`, mL, y + 5)
  doc.setTextColor(0, 0, 0)
  y += 12

  // ── Summary strip (horizontal) ────────────────────────────────────
  const summaryItems = [
    { label: 'Нараховано', value: `${opts.totalTrainer.toLocaleString('uk-UA')} ₴` },
    { label: 'Готівка на руках', value: `${opts.cashBalanceTotal.toLocaleString('uk-UA')} ₴` },
    { label: 'Виплачено за період', value: `${opts.totalPaidPeriod.toLocaleString('uk-UA')} ₴` },
    { label: 'До виплати', value: `${Math.max(0, opts.toPay).toLocaleString('uk-UA')} ₴` },
  ]

  autoTable(doc, {
    startY: y,
    head: [summaryItems.map(s => s.label)],
    body: [summaryItems.map(s => s.value)],
    theme: 'grid',
    headStyles: { font: 'Geist', fontSize: 8, fillColor: colHead, textColor: 255, halign: 'center', cellPadding: 2, lineWidth: 0.1, lineColor: [180, 180, 180] },
    bodyStyles: { font: 'Geist', fontSize: 11, fontStyle: 'bold', halign: 'center', cellPadding: 3, lineWidth: 0.1, lineColor: [180, 180, 180] },
    columnStyles: {
      0: { cellWidth: (pageW - mL - mR) / 4 },
      1: { cellWidth: (pageW - mL - mR) / 4 },
      2: { cellWidth: (pageW - mL - mR) / 4 },
      3: { cellWidth: (pageW - mL - mR) / 4 },
    },
    margin: { left: mL, right: mR },
  })

  y = (doc as any).lastAutoTable.finalY + 6

  // ── Build classes table body ──────────────────────────────────────
  const classBody: (string | { content: string; styles: object })[][] = []

  for (const day of dayGroups) {
    classBody.push([
      { content: day.dateLabel, styles: { fontStyle: 'bold', fillColor: colDayBg } },
      ...ticketTypes.map(tt => ({
        content: day.totalByType[tt] != null ? `${day.totalByType[tt]}` : '—',
        styles: { fontStyle: 'bold' as const, fillColor: colDayBg, halign: 'right' as const, textColor: day.totalByType[tt] ? [0,0,0] : colGray },
      })),
      {
        content: `${day.totalTrainer.toLocaleString('uk-UA')} ₴`,
        styles: { fontStyle: 'bold' as const, fillColor: colDayBg, halign: 'right' as const },
      },
    ])
  }

  // Period total row
  const totalByType: Record<string, number> = {}
  for (const r of opts.rows) totalByType[r.ticket_type] = (totalByType[r.ticket_type] ?? 0) + r.total_clients
  classBody.push([
    { content: 'Всього за період', styles: { fontStyle: 'bold', fillColor: colTotalBg } },
    ...ticketTypes.map(tt => ({
      content: totalByType[tt] != null ? `${totalByType[tt]}` : '—',
      styles: { fontStyle: 'bold' as const, fillColor: colTotalBg, halign: 'right' as const },
    })),
    {
      content: `${opts.totalTrainer.toLocaleString('uk-UA')} ₴`,
      styles: { fontStyle: 'bold' as const, fillColor: colTotalBg, halign: 'right' as const },
    },
  ])

  // ── Render classes table (left column) ────────────────────────────
  autoTable(doc, {
    startY: y,
    tableWidth: classW,
    head: [['Дата', ...ticketTypes.map(tt => ticketTypeShortLabel(tt)), 'Нараховано']],
    body: classBody,
    theme: 'striped',
    headStyles: { font: 'Geist', fontSize: 8, fillColor: colHead, textColor: 255, lineWidth: 0.1, lineColor: [180, 180, 180] },
    styles: { font: 'Geist', fontSize: 8, cellPadding: 1.5, lineWidth: 0.1, lineColor: [180, 180, 180] },
    columnStyles: {
      0: { cellWidth: dateColW },
      ...Object.fromEntries(ticketTypes.map((_, i) => [i + 1, { cellWidth: typeColW, halign: 'right' }])),
      [ticketTypes.length + 1]: { cellWidth: amtColW, halign: 'right' },
    },
    margin: { left: mL, right: mR },
  })

  const classTableBottom = (doc as any).lastAutoTable.finalY

  // ── Build cash table (right column) ──────────────────────────────
  if (opts.cashBalance) {
    const cashX = mL + classW + gap
    const cashTableW = cashW
    const descW = cashTableW - 28 - 22  // date 28 + amt 22

    const cashBody: (string | { content: string; styles: object })[][] = []
    const sectionBg: [number, number, number] = [245, 245, 245]

    if (opts.cashBalance.cash_sales.length > 0) {
      cashBody.push([
        { content: 'Cash продажі', styles: { fontStyle: 'bold', fillColor: sectionBg, colSpan: 3, textColor: colGray } },
        '', '',
      ])
      for (const s of opts.cashBalance.cash_sales) {
        cashBody.push([
          `${formatDate(s.created_at)} ${formatTime(s.created_at)}`,
          s.client_name + (s.ticket_name ? `\n${s.ticket_name}` : ''),
          { content: `+${s.amount.toLocaleString('uk-UA')} ₴`, styles: { halign: 'right' as const, textColor: colGreen, fontStyle: 'bold' as const } },
        ])
      }
    }

    if (opts.cashBalance.expenses.length > 0) {
      cashBody.push([
        { content: 'Витрати', styles: { fontStyle: 'bold', fillColor: sectionBg, colSpan: 3, textColor: colGray } },
        '', '',
      ])
      for (const e of opts.cashBalance.expenses) {
        cashBody.push([
          `${formatDate(e.created_at)} ${formatTime(e.created_at)}`,
          e.description ?? '—',
          { content: `−${e.amount.toLocaleString('uk-UA')} ₴`, styles: { halign: 'right' as const, textColor: colRed, fontStyle: 'bold' as const } },
        ])
      }
    }

    if (opts.cashBalance.salary_payments.length > 0) {
      cashBody.push([
        { content: 'Виплати ЗП', styles: { fontStyle: 'bold', fillColor: sectionBg, colSpan: 3, textColor: colGray } },
        '', '',
      ])
      for (const p of opts.cashBalance.salary_payments) {
        cashBody.push([
          formatDate(p.payment_date),
          'Виплата тренеру',
          { content: `−${p.amount.toLocaleString('uk-UA')} ₴`, styles: { halign: 'right' as const, textColor: colRed, fontStyle: 'bold' as const } },
        ])
      }
    }

    cashBody.push([
      { content: 'Разом на руках', styles: { fontStyle: 'bold', fillColor: colTotalBg, colSpan: 2 } },
      '',
      {
        content: `${opts.cashBalanceTotal.toLocaleString('uk-UA')} ₴`,
        styles: { fontStyle: 'bold' as const, fillColor: colTotalBg, halign: 'right' as const },
      },
    ])

    autoTable(doc, {
      startY: y,
      tableWidth: cashTableW,
      head: [['Дата', 'Клієнт / Опис', 'Сума']],
      body: cashBody,
      theme: 'striped',
      headStyles: { font: 'Geist', fontSize: 8, fillColor: colHead, textColor: 255, lineWidth: 0.1, lineColor: [180, 180, 180] },
      styles: { font: 'Geist', fontSize: 7.5, cellPadding: 1.5, lineWidth: 0.1, lineColor: [180, 180, 180] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: descW },
        2: { cellWidth: 22, halign: 'right' },
      },
      margin: { left: cashX, right: mR },
    })
  }

  // ── Payments table (below, full width) ───────────────────────────
  if (opts.payments.length > 0) {
    const paymentsY = Math.max(classTableBottom, (doc as any).lastAutoTable.finalY) + 6

    // If not enough space, new page
    if (paymentsY > pageH - 30) {
      doc.addPage()
      y = mT
    } else {
      y = paymentsY
    }

    doc.setFont('Geist', 'bold')
    doc.setFontSize(10)
    doc.text('Виплати', mL, y)
    y += 4

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
      headStyles: { font: 'Geist', fontSize: 8, fillColor: colHead, textColor: 255, lineWidth: 0.1, lineColor: [180, 180, 180] },
      styles: { font: 'Geist', fontSize: 8, cellPadding: 1.5, lineWidth: 0.1, lineColor: [180, 180, 180] },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: mL, right: mR },
    })
  }

  // ── Page numbers ──────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('Geist', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...colGray)
    doc.text(`${i} / ${pageCount}`, pageW - mR, pageH - 5, { align: 'right' })
  }

  const fileName = `salary_${opts.trainerName.replace(/\s+/g, '_')}_${opts.dateFrom}_${opts.dateTo}.pdf`
  doc.save(fileName)
}
