import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'
import tailwindAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font)', ...defaultTheme.fontFamily.sans],
        mono: ['var(--mono)', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        'bg-3': 'var(--bg-3)',
        border: 'var(--border)',
        'border-hover': 'var(--border-hover)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        accent: 'var(--accent)',
        'accent-dim': 'var(--accent-dim)',
        'accent-text': 'var(--accent-text)',
        'accent-border': 'var(--accent-border)',
        'accent-border-hover': 'var(--accent-border-hover)',
        'accent-border-strong': 'var(--accent-border-strong)',
        danger: 'var(--danger)',
        'danger-dim': 'var(--danger-dim)',
        'danger-border': 'var(--danger-border)',
        'danger-border-hover': 'var(--danger-border-hover)',
        'danger-border-strong': 'var(--danger-border-strong)',
        success: 'var(--success)',
        'success-dim': 'var(--success-dim)',
        warning: 'var(--warning)',
        'warning-dim': 'var(--warning-dim)',
        fop: 'var(--fop)',
        'fop-dim': 'var(--fop-dim)',
        card: 'var(--card)',
        'card-dim': 'var(--card-dim)',
        deposit: 'var(--deposit)',
        'deposit-dim': 'var(--deposit-dim)',
      },
      spacing: {
        'control-h': 'var(--control-h)',
        'topbar-h': 'var(--topbar-h)',
        'topbar-py': 'var(--topbar-py)',
        'topbar-px': 'var(--topbar-px)',
        'sidebar-w': 'var(--sidebar-w)',
        'bottom-nav-h': 'var(--bottom-nav-h)',
      },
      borderRadius: {
        base: 'var(--radius)',
        sm: 'var(--radius-sm)',
        badge: 'var(--badge-radius)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        standard: 'var(--motion-standard)',
      },
      animation: {
        'dot-pulse': 'dotPulse 1.4s ease-in-out infinite',
      },
      keyframes: {
        dotPulse: {
          '0%, 80%, 100%': { opacity: '0.2', transform: 'scale(0.8)' },
          '40%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [tailwindAnimate],
} satisfies Config

export default config
