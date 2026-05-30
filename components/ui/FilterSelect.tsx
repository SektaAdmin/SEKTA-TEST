'use client'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown } from 'lucide-react'

const ALL = '__all__'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
  // When true, empty string value is mapped to ALL sentinel internally.
  // Use for filters where '' means "show all". Default: true.
  allowEmpty?: boolean
}

export default function FilterSelect({ value, onChange, placeholder, options, allowEmpty = true }: Props) {
  const radixValue = allowEmpty && value === '' ? ALL : value
  function handleChange(v: string) {
    onChange(allowEmpty && v === ALL ? '' : v)
  }
  return (
    <SelectPrimitive.Root value={radixValue} onValueChange={handleChange}>
      <SelectPrimitive.Trigger className="fs-trigger" aria-label={placeholder}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="fs-chevron" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="fs-content" position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport>
            {options.map(o => {
              const radixKey = allowEmpty && o.value === '' ? ALL : o.value
              return (
                <SelectPrimitive.Item key={radixKey} value={radixKey} className="fs-item">
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              )
            })}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
