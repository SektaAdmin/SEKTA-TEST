import type { ReactNode } from 'react'
import styles from './trainer.module.css'

export default function TrainerLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>
}
