type Variant = 'cash' | 'fop' | 'personal_card' | 'deposit' | 'default'

interface Props {
  variant?: Variant
  label: string
  className?: string
}

const variants: Record<Variant, string> = {
  cash:          'bg-[var(--accent-dim)] text-[var(--accent)] border-[rgba(94,106,210,0.2)]',
  fop:           'bg-[rgba(96,160,240,0.1)] text-[#60a0f0] border-[rgba(96,160,240,0.2)]',
  personal_card: 'bg-[rgba(240,160,96,0.1)] text-[#f0a060] border-[rgba(240,160,96,0.2)]',
  deposit:       'bg-[rgba(255,92,92,0.1)] text-[var(--danger)] border-[rgba(255,92,92,0.2)]',
  default:       'bg-[var(--bg-3)] text-[var(--text-2)] border-[var(--border)]',
}

export default function Badge({ variant = 'default', label, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-medium border border-[0.5px] ${variants[variant]} ${className}`}>
      {label}
    </span>
  )
}
