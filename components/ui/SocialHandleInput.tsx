'use client'

import { UseFormRegisterReturn } from 'react-hook-form'
import styles from './SocialHandleInput.module.css'

interface SocialHandleInputProps {
  id: string
  label: string
  registration: UseFormRegisterReturn
  disabled?: boolean
}

export function SocialHandleInput({ id, label, registration, disabled }: SocialHandleInputProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.inputPrefix}>
        <span className={styles.prefix}>@</span>
        <input
          id={id}
          type="text"
          {...registration}
          placeholder="username"
          disabled={disabled}
          className={styles.input}
        />
      </div>
    </div>
  )
}
