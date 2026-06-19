'use client'
import styles from '../dashboard.module.css'

interface Props {
  onRetry: () => void
}

/* Уніфікований стан помилки для блоків дашборду.
   Показує нейтральне повідомлення без технічних деталей + кнопку повтору. */
export function BlockError({ onRetry }: Props) {
  return (
    <div className={styles.blockError}>
      <span className={styles.blockErrorMsg}>Не вдалося завантажити дані</span>
      <button type="button" className={styles.blockErrorRetry} onClick={onRetry}>
        Спробувати ще раз
      </button>
    </div>
  )
}
