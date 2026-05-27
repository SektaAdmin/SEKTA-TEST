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
  fullScreen?: boolean
}

export function ModalShell({ title, onClose, footer, children, width = 420, modalClassName, bodyClassName, fullScreen }: ModalShellProps) {
  const titleId = useId()
  const modalRef = useModalFocus(onClose)

  return (
    <div
      className={[styles.overlay, fullScreen ? styles.overlayFullScreen : undefined].filter(Boolean).join(' ')}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className={[styles.modal, fullScreen ? styles.modalFullScreen : undefined, modalClassName].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={fullScreen ? undefined : { width, maxWidth: '100%' }}
      >
        <div className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>
        <div className={[styles.body, bodyClassName].filter(Boolean).join(' ')}>{children}</div>
        {footer !== null && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  )
}
