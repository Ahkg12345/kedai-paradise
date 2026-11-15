import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        'surface-subtle': 'var(--surface-subtle)',
        'green-header': 'var(--green-header)',
        'green-mid': 'var(--green-mid)',
        'green-soft': 'var(--green-soft)',
        mint: 'var(--mint)',
        'mint-light': 'var(--mint-light)',
        'success-chip': 'var(--success-chip)',
        rust: 'var(--rust)',
        orange: 'var(--orange)',
        'orange-dark': 'var(--orange-dark)',
        error: 'var(--error)',
        'error-bg': 'var(--error-bg)',
        'urgent-card-bg': 'var(--urgent-card-bg)',
        peach: 'var(--peach)',
        'warning-bg': 'var(--warning-bg)',
        brown: 'var(--brown)',
        'brown-dark': 'var(--brown-dark)',
        foreground: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        slate: 'var(--slate)',
        'selected-row': 'var(--selected-row)',
        'qris-confirm': 'var(--qris-confirm)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"Roboto Mono"', 'monospace'],
      },
      boxShadow: {
        header: '0 3px 12px rgb(25 28 27 / 10%)',
        card: '0 1px 2px rgb(25 28 27 / 5%)',
      },
    },
  },
  plugins: [],
} satisfies Config
