'use client'
import { useState, useRef, useCallback, useId } from 'react'
import { supabase } from '@/lib/supabase'
import { formatClientLabel } from '@/lib/formatters'
import type { Client } from '@/types'


interface Props {
  inputId?: string
  initialLabel?: string
  onSelect: (client: Client) => void
  onClear: () => void
  error?: string
  disabled?: boolean
}

async function searchClients(q: string): Promise<Client[]> {
  const trimmed = q.trim()
  if (!trimmed) return []

  const parts = trimmed.split(/\s+/)

  if (parts.length === 1) {
    const p = parts[0]
    const { data } = await supabase
      .from('clients')
      .select('id,first_name,last_name,phone')
      .or(`first_name.ilike.%${p}%,last_name.ilike.%${p}%,phone.ilike.%${p}%`)
      .order('last_name')
      .limit(10)
    return data ?? []
  }

  const [a, b] = parts
  const [r1, r2] = await Promise.all([
    supabase.from('clients').select('id,first_name,last_name,phone').ilike('first_name', `%${a}%`).ilike('last_name', `%${b}%`).order('last_name').limit(10),
    supabase.from('clients').select('id,first_name,last_name,phone').ilike('first_name', `%${b}%`).ilike('last_name', `%${a}%`).order('last_name').limit(10),
  ])
  const seen = new Set<string>()
  return [...(r1.data ?? []), ...(r2.data ?? [])].filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}

const inputCls = 'w-full px-3 py-2 bg-[var(--bg-3)] border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text)] text-[13px] outline-none transition-colors duration-150 placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:opacity-50'

export default function ClientSearchCombobox({ inputId, initialLabel = '', onSelect, onClear, error, disabled }: Props) {
  const listboxId = useId()
  const [search, setSearch] = useState(initialLabel)
  const [results, setResults] = useState<Client[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isSelected, setIsSelected] = useState(!!initialLabel)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleInput = useCallback((value: string) => {
    setSearch(value)
    setIsSelected(false)
    setIsOpen(true)
    setActiveIndex(-1)
    onClear()
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setResults(await searchClients(value))
      setActiveIndex(-1)
    }, 250)
  }, [onClear])

  const handleSelect = useCallback((client: Client) => {
    setSearch(formatClientLabel(client))
    setResults([])
    setIsOpen(false)
    setActiveIndex(-1)
    setIsSelected(true)
    onSelect(client)
  }, [onSelect])

  function handleFocus() {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    if (search.trim() && !isSelected) {
      setIsOpen(true)
      if (!results.length) searchClients(search).then(r => { setResults(r); setActiveIndex(-1) })
    }
  }

  function handleBlur() {
    blurTimer.current = setTimeout(() => setIsOpen(false), 150)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); handleSelect(results[activeIndex]) }
    else if (e.key === 'Escape') setIsOpen(false)
  }

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        className={inputCls}
        value={search}
        onChange={e => handleInput(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Пошук за іменем або телефоном..."
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `csc-opt-${activeIndex}` : undefined}
        disabled={disabled}
      />
      {isOpen && search.trim() && (
        <div
          id={listboxId}
          className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-2)] border border-[0.5px] border-[var(--border-hover)] rounded-[var(--radius-sm)] shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-50 max-h-[200px] overflow-y-auto"
          role="listbox"
          aria-label="Результати пошуку"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-[12px] text-[var(--text-3)]">Нічого не знайдено</div>
          ) : results.map((c, i) => (
            <div
              key={c.id}
              id={`csc-opt-${i}`}
              className={`flex items-center justify-between px-3 py-2.5 text-[13px] cursor-pointer transition-colors duration-100 ${i === activeIndex ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'text-[var(--text)] hover:bg-[var(--bg-3)]'}`}
              onMouseDown={() => handleSelect(c)}
              role="option"
              aria-selected={i === activeIndex}
            >
              <span>{formatClientLabel(c)}</span>
              {c.phone && <span className="text-[11px] text-[var(--text-3)] ml-2">{c.phone}</span>}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-[11px] text-[var(--danger)] mt-0.5" role="alert">{error}</p>}
    </div>
  )
}
