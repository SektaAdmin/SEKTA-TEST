import styles from './ModalFooter.module.css'

interface ModalFooterProps {
  onCancel: () => void
  onSave?: () => void
  saveLabel?: string
  cancelLabel?: string
  loading?: boolean
  saveType?: 'button' | 'submit'
  disabled?: boolean
  danger?: boolean
}

export function ModalFooter({
  onCancel,
  onSave,
  saveLabel = 'Зберегти',
  cancelLabel = 'Скасувати',
  loading = false,
  saveType = 'button',
  disabled = false,
  danger = false,
}: ModalFooterProps) {
  return (
    <>
      <button
        type="button"
        className={styles.btnCancel}
        onClick={onCancel}
        disabled={loading}
      >
        {cancelLabel}
      </button>
      {onSave && (
        <button
          type={saveType}
          className={danger ? styles.btnDanger : styles.btnSave}
          onClick={saveType === 'button' ? onSave : undefined}
          disabled={loading || disabled}
        >
          {loading ? 'Збереження...' : saveLabel}
        </button>
      )}
    </>
  )
}
