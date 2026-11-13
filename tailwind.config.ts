import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1440px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          strong: 'hsl(var(--warning-strong))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        /* Coal / graphite / charcoal scale for dark surfaces */
        graphite: {
          50: 'hsl(50 27% 96%)',
          100: 'hsl(48 19% 89%)',
          200: 'hsl(60 9% 83%)',
          300: 'hsl(120 3% 60%)',
          400: 'hsl(120 3% 47%)',
          500: 'hsl(147 9% 33%)',
          600: 'hsl(147 9% 25%)',
          700: 'hsl(147 9% 21%)',
          800: 'hsl(150 8% 14%)',
          900: 'hsl(144 7% 14%)',
          950: 'hsl(150 8% 10%)',
        },
        /* Copper accent scale */
        copper: {
          50: 'hsl(25 45% 94%)',
          100: 'hsl(25 40% 86%)',
          200: 'hsl(25 42% 75%)',
          300: 'hsl(25 43% 64%)',
          400: 'hsl(25 45% 54%)',
          500: 'hsl(25 45% 50%)',
          600: 'hsl(25 45% 44%)',
          700: 'hsl(25 42% 37%)',
          800: 'hsl(25 38% 30%)',
          900: 'hsl(25 35% 24%)',
        },
        /* Mineral sage scale */
        sage: {
          50: 'hsl(147 20% 94%)',
          100: 'hsl(147 18% 87%)',
          200: 'hsl(147 16% 75%)',
          300: 'hsl(147 14% 62%)',
          400: 'hsl(147 13% 52%)',
          500: 'hsl(147 12% 46%)',
          600: 'hsl(147 11% 40%)',
          700: 'hsl(147 10% 34%)',
          800: 'hsl(147 9% 28%)',
          900: 'hsl(147 8% 22%)',
        },
        /* Warm ash / mineral surface scale */
        ash: {
          50: 'hsl(50 27% 96%)',
          100: 'hsl(48 19% 92%)',
          200: 'hsl(48 18% 85%)',
          300: 'hsl(48 16% 75%)',
          400: 'hsl(48 15% 63%)',
          500: 'hsl(48 14% 52%)',
          600: 'hsl(48 12% 42%)',
          700: 'hsl(48 10% 34%)',
          800: 'hsl(48 8% 26%)',
          900: 'hsl(48 7% 18%)',
        },
        /* Mineral amber */
        amber: {
          400: 'hsl(40 62% 66%)',
          500: 'hsl(40 62% 56%)',
          600: 'hsl(40 58% 48%)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 4px 12px -6px rgb(0 0 0 / 0.06)',
        'soft-lg': '0 2px 4px -1px rgb(0 0 0 / 0.05), 0 12px 28px -10px rgb(0 0 0 / 0.08)',
        ring: '0 0 0 3px hsl(var(--ring) / 0.25)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-from-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-out-to-right': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 180ms ease-out',
        'fade-in-up': 'fade-in-up 240ms ease-out',
        'fade-out': 'fade-out 140ms ease-in',
        'scale-in': 'scale-in 200ms ease-out',
        'slide-in-from-right': 'slide-in-from-right 220ms ease-out',
        'slide-out-to-right': 'slide-out-to-right 180ms ease-in',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
