'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/useAsync'
import { useRefs } from '@/contexts/RefsContext'
import { ModalShell } from '@/components/ui/ModalShell'
import { FormField } from '@/components/ui/FormField'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import SalesDateRangePicker, { type Preset } from '@/components/SalesDateRangePicker'
import { listSeriesTemplates, updateSeriesPeriod } from '@/lib/queries/classes'
import {
  listClientSeries, previewPlannedChange, createPlannedChange, upsertSeriesClientPeriod,
} from '@/lib/queries/planned'
import {
  KIND_LABEL, RESULT_LABEL, itemNeedsAttention, kyivDateLabel, seriesLabel, summarizeApplied,
  type PlannedApplyItem, type PlannedKind,
} from '@/lib/planned'
import { getMondayOf, toYMD } from '@/lib/dateUtils'
import styles from './planned.module.css'

/* Майстер «Нова зміна» — єдина точка створення відкладених дій.
   Ярлики (картка клієнта, примарний слот, SeriesModal, кабінет тренера) відкривають
   його з prefill і стартують одразу з кроку 2. */

export interface PlannedPrefill {
  kind?: PlannedKind
  client?: { id: string; name: string }
  seriesId?: string
  /** Одна дата (запис наперед на конкретне заняття). */
  date?: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
  /** owner/admin: «Тимчасовий шаблон» (тренер не редагує class_series). */
  canEditTemplates: boolean
  prefill?: PlannedPrefill
}

const KIND_HINT: Record<PlannedKind, string> = {
  skip: 'Постійник не ходить у групу на ці дати. Записи не створюються й не списуються.',
  enroll: 'Записати клієнта на заняття шаблону, навіть якщо тиждень ще не відкрито.',
  temp_regular: 'Ходить у групу як постійник лише в обраний період.',
  temp_template: 'Шаблон створює заняття лише в обраний період (напр. індив на місяць).',
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function today(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

const PRESETS: Preset[] = [
  { label: 'Цей тиждень', getRange: () => ({ from: toYMD(today()), to: toYMD(addDays(getMondayOf(today()), 6)) }) },
  { label: 'Наступний тиждень', getRange: () => {
    const mon = addDays(getMondayOf(today()), 7)
    return { from: toYMD(mon), to: toYMD(addDays(mon, 6)) }
  } },
  { label: '2 тижні', getRange: () => ({ from: toYMD(today()), to: toYMD(addDays(today(), 13)) }) },
  { label: 'Місяць', getRange: () => ({ from: toYMD(today()), to: toYMD(addDays(today(), 29)) }) },
]

export default function PlannedChangeModal({ onClose, onSaved, canEditTemplates, prefill }: Props) {
  const { trainingTypes } = useRefs()
  const typeLabel = (code: string) => trainingTypes.find(t => t.code === code)?.label ?? code

  const [step, setStep] = useState<1 | 2 | 3>(prefill?.kind ? 2 : 1)
  const [kind, setKind] = useState<PlannedKind | null>(prefill?.kind ?? null)
  const [client, setClient] = useState<{ id: string; name: string } | null>(prefill?.client ?? null)
  const [seriesIds, setSeriesIds] = useState<string[]>(prefill?.seriesId ? [prefill.seriesId] : [])
  const [range, setRange] = useState<{ from: string; to: string }>(
    prefill?.date ? { from: prefill.date, to: prefill.date } : { from: '', to: '' }
  )
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const needsClient = kind !== 'temp_template'
  const multiSeries = kind === 'skip'

  const { data: templates } = useAsync(() => listSeriesTemplates(supabase), [])
  const { data: clientSeries, loading: clientSeriesLoading } = useAsync(
    () => client && kind === 'skip'
      ? listClientSeries(supabase, client.id)
      : Promise.resolve({ data: [], error: null }),
    [client?.id, kind]
  )

  const templateOptions = useMemo(() => (templates ?? []).map(t => ({
    id: t.id,
    label: seriesLabel(t, typeLabel(t.ticket_type)),
    trainer: t.trainers?.name ?? null,
  })), [templates, trainingTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Пауза — лише групи, де клієнт постійник (безстроковий або тимчасовий).
  const pauseOptions = useMemo(() => (clientSeries ?? [])
    .filter(r => r.class_series)
    .map(r => ({
      id: r.series_id,
      label: seriesLabel(r.class_series!, typeLabel(r.class_series!.ticket_type)),
      trainer: r.class_series!.trainers?.name ?? null,
    })), [clientSeries, trainingTypes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Превʼю (dry-run) ──────────────────────────────────────────
  const [preview, setPreview] = useState<{ items: PlannedApplyItem[]; error: string | null } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewable = step === 3 && kind !== null && kind !== 'temp_template'
    && !!client && seriesIds.length > 0 && !!range.from && !!range.to

  useEffect(() => {
    if (!previewable || !client || !kind) { setPreview(null); return }
    let cancelled = false
    setPreviewLoading(true)
    const action = kind === 'skip' ? 'skip' : 'enroll'
    Promise.all(seriesIds.map(sid => previewPlannedChange(supabase, {
      seriesId: sid, clientId: client.id, action, dateFrom: range.from, dateTo: range.to,
    }))).then(results => {
      if (cancelled) return
      const err = results.find(r => r.error)?.error ?? null
      setPreview({ items: results.flatMap(r => r.items), error: err })
      setPreviewLoading(false)
    })
    return () => { cancelled = true }
  }, [previewable, client?.id, kind, seriesIds.join(','), range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Навігація ─────────────────────────────────────────────────
  const step2Valid = (!needsClient || !!client) && seriesIds.length > 0
  const step3Valid = !!range.from && !!range.to && !(preview?.error)

  function pickKind(k: PlannedKind) {
    setKind(k)
    setSeriesIds(prefill?.seriesId ? [prefill.seriesId] : [])
    setStep(2)
  }

  function toggleSeries(id: string) {
    setSeriesIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function save() {
    if (!kind || !step3Valid) return
    setSaving(true)
    let applied: PlannedApplyItem[] = []
    const errors: string[] = []

    if (kind === 'skip' || kind === 'enroll') {
      for (const sid of seriesIds) {
        const res = await createPlannedChange(supabase, {
          seriesId: sid, clientId: client!.id, action: kind, dateFrom: range.from, dateTo: range.to, note,
        })
        if (res.error) errors.push(res.error)
        applied = applied.concat(res.applied)
      }
    } else if (kind === 'temp_regular') {
      const res = await upsertSeriesClientPeriod(supabase, {
        seriesId: seriesIds[0], clientId: client!.id, validFrom: range.from, validTo: range.to,
      })
      if (res.error) errors.push(res.error)
      applied = res.applied
    } else {
      const { error } = await updateSeriesPeriod(supabase, seriesIds[0], range.from, range.to)
      if (error) errors.push(error)
    }
    setSaving(false)

    if (errors.length > 0) { toast.error(errors[0]); return }
    toast.success(kind === 'temp_template' ? 'Період шаблону збережено' : `Збережено: ${summarizeApplied(applied, 'done')}`)
    const attention = applied.filter(itemNeedsAttention)
    if (attention.length > 0) {
      toast.warning(`Потребують уваги ${attention.length} занять`, {
        duration: 10000,
        description: attention.slice(0, 5).map((i, n) => (
          <div key={n}>{kyivDateLabel(i.starts_at)} — {RESULT_LABEL[i.result]}{i.no_sessions ? ', немає оплачених занять' : ''}</div>
        )),
      })
    }
    onSaved()
  }

  const title = kind ? KIND_LABEL[kind] : 'Нова зміна'
  const seriesOptions = kind === 'skip' ? pauseOptions : templateOptions

  const footer = (
    <>
      {step > 1 && !(prefill?.kind && step === 2) ? (
        <button type="button" className="btn-secondary" onClick={() => setStep(s => (s - 1) as 1 | 2)} disabled={saving}>
          Назад
        </button>
      ) : (
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Скасувати</button>
      )}
      {step === 2 && (
        <button type="button" className="btn-primary" onClick={() => setStep(3)} disabled={!step2Valid}>Далі</button>
      )}
      {step === 3 && (
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !step3Valid || previewLoading}>
          {saving ? 'Збереження...' : 'Зберегти'}
        </button>
      )}
    </>
  )

  return (
    <ModalShell title={title} onClose={onClose} footer={step === 1 ? null : footer}>
      {step === 1 && (
        <div className={styles.kindList}>
          {(['skip', 'enroll', 'temp_regular', 'temp_template'] as PlannedKind[])
            .filter(k => k !== 'temp_template' || canEditTemplates)
            .map(k => (
              <button key={k} type="button" className={styles.kindCard} onClick={() => pickKind(k)}>
                <span className={styles.kindTitle}>{KIND_LABEL[k]}</span>
                <span className={styles.kindHint}>{KIND_HINT[k]}</span>
              </button>
            ))}
        </div>
      )}

      {step === 2 && kind && (
        <>
          <p className={styles.stepHint}>{KIND_HINT[kind]}</p>
          {needsClient && (
            <FormField id="pc-client" label="Клієнт" required>
              <ClientSearchCombobox
                inputId="pc-client"
                initialLabel={client?.name ?? ''}
                onSelect={c => {
                  setClient({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(' ') })
                  if (kind === 'skip') setSeriesIds(prefill?.seriesId ? [prefill.seriesId] : [])
                }}
                onClear={() => { setClient(null); if (kind === 'skip') setSeriesIds([]) }}
              />
            </FormField>
          )}

          {multiSeries ? (
            <div className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Групи на паузу</span>
              {!client ? (
                <span className={styles.muted}>Спершу оберіть клієнта</span>
              ) : clientSeriesLoading ? (
                <span className={styles.muted}>Завантаження...</span>
              ) : pauseOptions.length === 0 ? (
                <span className={styles.muted}>Клієнт не є постійником жодної групи</span>
              ) : (
                <div className={styles.checkList}>
                  {pauseOptions.map(o => (
                    <label key={o.id} className={styles.checkRow}>
                      <input type="checkbox" checked={seriesIds.includes(o.id)} onChange={() => toggleSeries(o.id)} />
                      <span className={styles.checkLabel}>{o.label}</span>
                      {o.trainer && <span className={styles.muted}>{o.trainer}</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <FormField id="pc-series" label={kind === 'temp_template' ? 'Шаблон' : 'Група (слот шаблону)'} required>
              <select id="pc-series" value={seriesIds[0] ?? ''} onChange={e => setSeriesIds(e.target.value ? [e.target.value] : [])}>
                <option value="">— оберіть —</option>
                {seriesOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.label}{o.trainer ? ` · ${o.trainer}` : ''}</option>
                ))}
              </select>
            </FormField>
          )}
        </>
      )}

      {step === 3 && kind && (
        <>
          <div className={styles.fieldBlock}>
            <span className={styles.fieldLabel}>Період *</span>
            <SalesDateRangePicker
              dateFrom={range.from}
              dateTo={range.to}
              onChangeFrom={v => setRange(r => ({ ...r, from: v }))}
              onChangeTo={v => setRange(r => ({ ...r, to: v }))}
              onClear={() => setRange({ from: '', to: '' })}
              presets={PRESETS}
            />
            {kind === 'enroll' && <span className={styles.muted}>Для одного заняття оберіть один день.</span>}
          </div>

          {(kind === 'skip' || kind === 'enroll') && (
            <FormField id="pc-note" label="Примітка">
              <input id="pc-note" type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Відпустка, хвороба…" />
            </FormField>
          )}

          {kind === 'temp_template' ? (
            <p className={styles.stepHint}>
              Поза періодом шаблон не створюватиме заняття. Уже створені заняття не змінюються.
            </p>
          ) : (
            <PreviewBlock loading={previewLoading} preview={preview} ready={previewable} />
          )}
        </>
      )}
    </ModalShell>
  )
}

function PreviewBlock({ loading, preview, ready }: {
  loading: boolean
  preview: { items: PlannedApplyItem[]; error: string | null } | null
  ready: boolean
}) {
  if (!ready) return <p className={styles.muted}>Оберіть період — покажемо, які заняття це зачепить.</p>
  if (loading && !preview) return <p className={styles.muted}>Рахуємо наслідки...</p>
  if (!preview) return null
  if (preview.error) return <p className={styles.previewError} role="alert">{preview.error}</p>
  return (
    <div className={styles.preview} aria-live="polite">
      <span className={styles.previewSummary}>{summarizeApplied(preview.items, 'preview')}</span>
      {preview.items.length > 0 && (
        <ul className={styles.previewList}>
          {preview.items.map((i, n) => (
            <li key={n} className={itemNeedsAttention(i) ? styles.previewItemWarn : styles.previewItem}>
              <span className={styles.previewDate}>{kyivDateLabel(i.starts_at)}</span>
              <span>{RESULT_LABEL[i.result]}{i.no_sessions ? ' · немає оплачених занять' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
