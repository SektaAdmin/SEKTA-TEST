'use client'
import { type ReactNode } from 'react'
import { useModalFocus } from '@/hooks/useModalFocus'

interface Props {
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: string
}

export default function Modal({ onClose, title, children, maxWidth = '440px' }: Props) {
  const ref = useModalFocus(onClose)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        className="flex flex-col w-full m-4 bg-[var(--bg-2)] border border-[0.5px] border-[var(--border-hover)] rounded-[var(--radius)] shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
        style={{ maxWidth }}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[0.5px] border-[var(--border)]">
          <h2 className="text-[16px] font-semibold text-[var(--text)] m-0">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Закрити"
            className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)] border-none bg-transparent text-[var(--text-2)] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-3)] hover:text-[var(--text)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="1" y1="1" x2="13" y2="13"/>
              <line x1="13" y1="1" x2="1" y2="13"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
