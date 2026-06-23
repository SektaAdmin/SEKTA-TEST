'use client'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown } from 'lucide-react'
import styles from './ActionSelect.module.css'

interface Option {
  value: string
  label: string
}

interface Props {
  options: Option[]
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function ActionSelect({ options, placeholder = 'Дія', disabled, onChange }: Props) {
  return (
    <SelectPrimitive.Root
      value=""
      onValueChange={val => { if (val) onChange(val) }}
    >
      <SelectPrimitive.Trigger className={styles.trigger} disabled={disabled} aria-label={placeholder}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className={styles.chevron} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={styles.content} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport>
            {options.map(opt => (
              <SelectPrimitive.Item key={opt.value} value={opt.value} className={styles.item}>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
