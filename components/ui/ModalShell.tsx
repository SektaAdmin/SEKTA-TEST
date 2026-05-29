'use client'

import { useId } from 'react'
import { useModalFocus } from '@/hooks/useModalFocus'
import styles from './ModalShell.module.css'

interface ModalShellProps {
  title: string
  onClose: () => void
  footer: React.ReactNode | null
  children: React.ReactNode
  width?: number
  modalClassName?: string
  bodyClassName?: string
  mobileFullScreen?: boolean
  headerActions?: React.ReactNode
}

export function ModalShell({ title, onClose, footer, children, width = 420, modalClassName, bodyClassName, mobileFullScreen, headerActions }: ModalShellProps) {
  const titleId = useId()
  const modalRef = useModalFocus(onClose)

  return (
    <div
      className={[styles.overlay, mobileFullScreen ? styles.overlayFullScreen : undefined].filter(Boolean).join(' ')}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className={[styles.modal, mobileFullScreen ? styles.modalFullScreen : undefined, modalClassName].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={mobileFullScreen ? undefined : { width, maxWidth: '100%' }}
      >
        <div className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          <div className={styles.headerRight}>
            {headerActions}
            <button className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
          </div>
        </div>
        <div className={[styles.body, bodyClassName].filter(Boolean).join(' ')}>{children}</div>
        {footer !== null && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )
}
