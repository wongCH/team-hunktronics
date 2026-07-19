/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--theme-base) / <alpha-value>)',
        surface: 'rgb(var(--theme-panel) / <alpha-value>)',
        elevated: 'rgb(var(--theme-elevated) / <alpha-value>)',
        overlay: 'rgb(var(--theme-elevated) / <alpha-value>)',
        border: 'rgb(var(--theme-line) / <alpha-value>)',
        borderStrong: 'var(--color-borderStrong)',
        white: 'rgb(var(--theme-foreground) / <alpha-value>)',
        neon: {
          DEFAULT: 'rgb(var(--theme-accent) / <alpha-value>)',
          bright: 'rgb(var(--theme-accent-foreground) / <alpha-value>)',
          soft: 'rgb(var(--theme-accent-foreground) / <alpha-value>)',
          deep: 'rgb(var(--theme-accent) / <alpha-value>)',
          dim: 'rgb(var(--theme-accent) / <alpha-value>)'
        },
        content: {
          DEFAULT: 'rgb(var(--theme-foreground) / <alpha-value>)',
          muted: 'rgb(var(--theme-muted) / <alpha-value>)',
          faint: 'rgb(var(--theme-faint) / <alpha-value>)'
        },
        emerald: {
          300: 'rgb(var(--theme-success) / <alpha-value>)',
          400: 'rgb(var(--theme-success) / <alpha-value>)'
        },
        amber: {
          200: 'rgb(var(--theme-warning) / <alpha-value>)',
          300: 'rgb(var(--theme-warning) / <alpha-value>)',
          400: 'rgb(var(--theme-warning) / <alpha-value>)'
        },
        red: {
          300: 'rgb(var(--theme-danger) / <alpha-value>)',
          400: 'rgb(var(--theme-danger) / <alpha-value>)'
        }
      },
      boxShadow: {
        neon: '0 0 0 1px rgb(var(--theme-accent) / 0.35), 0 0 18px -2px rgb(var(--theme-glow) / 0.45)',
        'neon-sm': '0 0 10px -2px rgb(var(--theme-glow) / 0.4)',
        'neon-lg': '0 0 30px -4px rgb(var(--theme-glow) / 0.55)',
        inset: 'inset 0 1px 0 0 rgb(var(--theme-foreground) / 0.03)'
      },
      borderRadius: {
        lg: 'calc(var(--theme-radius) - 4px)',
        xl: 'var(--theme-radius)'
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
        mono: ['SFMono-Regular', 'ui-monospace', 'Menlo', 'monospace']
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' }
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' }
        }
      },
      animation: {
        pulseGlow: 'pulseGlow 1.8s ease-in-out infinite',
        blink: 'blink 1s step-start infinite'
      }
    }
  },
  plugins: []
};
