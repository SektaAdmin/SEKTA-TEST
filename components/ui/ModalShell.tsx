'use client'

import { useId } from 'react'
import { useModalFocus } from '@/hooks/useModalFocus'
import styles from './ModalShell.module.css'

/** Дві канонічні ширини модалок (десктоп). form — форми/довідники, detail — перегляд деталей. */
const SIZE_WIDTH = { form: 440, detail: 760 } as const
type ModalSize = keyof typeof SIZE_WIDTH

interface ModalShellProps {
  title: string
  onClose: () => void
  footer: React.ReactNode | null
  children: React.ReactNode
  /** Розмір модалки на десктопі. Дефолт — form (440px). На мобільному всі — bottom-sheet. */
  size?: ModalSize
  modalClassName?: string
  bodyClassName?: string
  headerActions?: React.ReactNode
}

export function ModalShell({ title, onClose, footer, children, size = 'form', modalClassName, bodyClassName, headerActions }: ModalShellProps) {
  const titleId = useId()
  const modalRef = useModalFocus(onClose)

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className={[styles.modal, modalClassName].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width: SIZE_WIDTH[size], maxWidth: '100%' }}
      >
        <div className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          <div className={styles.headerRight}>
            {headerActions}
            <button className={styles.close} onClick={onClose} aria-label="Закрити">
              <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M3.28 2.22 2.22 3.28 6.94 8l-4.72 4.72 1.06 1.06L8 9.06l4.72 4.72 1.06-1.06L9.06 8l4.72-4.72-1.06-1.06L8 6.94z"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className={[styles.body, bodyClassName].filter(Boolean).join(' ')}>{children}</div>
        {footer !== null && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )
}
