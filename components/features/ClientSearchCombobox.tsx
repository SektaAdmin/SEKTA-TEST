'use client'
import { useState, useRef, useCallback, useId } from 'react'
import { supabase } from '@/lib/supabase'
import { formatClientLabel } from '@/lib/formatters'
import { searchClientsForCombobox } from '@/lib/queries/clients'
import type { Client } from '@/types'
import styles from './ClientSearchCombobox.module.css'


interface Props {
  inputId?: string
  initialLabel?: string
  onSelect: (client: Client) => void
  onClear: () => void
  error?: string
  disabled?: boolean
}

const searchClients = (q: string): Promise<Client[]> => searchClientsForCombobox(supabase, q)

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
    <div className={styles.wrapper}>
      <input
        id={inputId}
        type="text"
        className={styles.input}
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
          className={styles.dropdown}
          role="listbox"
          aria-label="Результати пошуку"
        >
          {results.length === 0 ? (
            <div className={styles.empty}>Нічого не знайдено</div>
          ) : results.map((c, i) => (
            <div
              key={c.id}
              id={`csc-opt-${i}`}
              className={`${styles.option}${i === activeIndex ? ' ' + styles.optionActive : ''}`}
              onMouseDown={() => handleSelect(c)}
              role="option"
              aria-selected={i === activeIndex}
            >
              <span>{formatClientLabel(c)}</span>
              {c.phone && <span className={styles.phone}>{c.phone}</span>}
            </div>
          ))}
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  )
}
