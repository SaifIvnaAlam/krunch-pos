import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        'section-alt': 'var(--section-alt)',
        card: 'var(--card)',
        elevated: 'var(--elevated)',
        chip: 'var(--chip)',
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        body: 'var(--body-text)',
        muted: 'var(--muted)',
        label: 'var(--label)',
        caption: 'var(--caption)',
        live: 'var(--live)',
        placeholder: 'var(--placeholder)',
        sky: { bg: 'var(--sky-bg)', ink: 'var(--sky-ink)' },
        mint: { bg: 'var(--mint-bg)', ink: 'var(--mint-ink)' },
        peach: { bg: 'var(--peach-bg)', ink: 'var(--peach-ink)' },
        lavender: { bg: 'var(--lav-bg)', ink: 'var(--lav-ink)' },
        sage: { bg: 'var(--sage-bg)', ink: 'var(--sage-ink)' },
      },
      borderColor: {
        0: 'var(--border-0)',
        1: 'var(--border-1)',
        2: 'var(--border-2)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        bento: '16px',
      },
      maxWidth: {
        content: '1100px',
      },
      boxShadow: {
        none: 'none',
      },
    },
  },
  plugins: [],
};
export default config;
