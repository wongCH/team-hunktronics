/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep dark base
        base: '#080b11',
        surface: '#0d131c',
        elevated: '#111a26',
        overlay: '#0a0f17',
        border: '#1c2a3a',
        borderStrong: '#26384d',
        // Neon blue accent scale
        neon: {
          DEFAULT: '#38bdf8',
          bright: '#00e5ff',
          soft: '#22d3ee',
          deep: '#0ea5e9',
          dim: '#1d4e63'
        },
        content: {
          DEFAULT: '#e6edf6',
          muted: '#8ea3bd',
          faint: '#5c718c'
        }
      },
      boxShadow: {
        neon: '0 0 0 1px rgba(56,189,248,0.35), 0 0 18px -2px rgba(0,229,255,0.45)',
        'neon-sm': '0 0 10px -2px rgba(0,229,255,0.4)',
        'neon-lg': '0 0 30px -4px rgba(0,229,255,0.55)',
        inset: 'inset 0 1px 0 0 rgba(255,255,255,0.03)'
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
}
