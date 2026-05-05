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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        className="flex flex-col w-full bg-[var(--bg-2)] border border-[0.5px] border-[var(--border-hover)] rounded-[var(--radius)] max-h-[90vh]"
        style={{ maxWidth }}
      >
        <div className="flex items-center justify-between px-5 pt-[18px] pb-4 border-b border-[0.5px] border-[var(--border)]">
          <h2 className="text-[14px] font-medium text-[var(--text)] m-0">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Закрити"
            className="border-none bg-transparent text-[var(--text-3)] cursor-pointer text-[14px] leading-none p-[2px] transition-colors duration-[120ms] hover:text-[var(--text)]"
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
