const { join } = require('path');

const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');

/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ['class'],
    content: [
        join(__dirname, '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        ...createGlobPatternsForDependencies(__dirname),
    ],
    prefix: '',
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: {
                '2xl': '1400px',
            },
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
                // Chatic Design System Colors - Theme Aware
                'chatic-primary': 'hsl(var(--chatic-primary))',
                'chatic-primary-border': 'hsl(var(--chatic-primary-border))',
                'chatic-primary-shadow': 'hsl(var(--chatic-primary-shadow))',
                'chatic-neutral': {
                    50: 'hsl(var(--chatic-neutral-50))',
                    100: 'hsl(var(--chatic-neutral-100))',
                    200: 'hsl(var(--chatic-neutral-200))',
                    300: 'hsl(var(--chatic-neutral-300))',
                    400: 'hsl(var(--chatic-neutral-400))',
                    500: 'hsl(var(--chatic-neutral-500))',
                    600: 'hsl(var(--chatic-neutral-600))',
                    700: 'hsl(var(--chatic-neutral-700))',
                    800: 'hsl(var(--chatic-neutral-800))',
                    900: 'hsl(var(--chatic-neutral-900))',
                },
                'chatic-text': {
                    primary: 'hsl(var(--chatic-text-primary))',
                    secondary: 'hsl(var(--chatic-text-secondary))',
                    tertiary: 'hsl(var(--chatic-text-tertiary))',
                    inverse: 'hsl(var(--chatic-text-inverse))',
                    accent: 'hsl(var(--chatic-text-accent))',
                },
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
                // Chatic Design System Border Radius
                'chatic-xs': '4.5px',
                'chatic-sm': '16px',
                'chatic-md': '36px',
                'chatic-lg': '100px',
            },
            fontFamily: {
                chatic: ['Pretendard', 'sans-serif'],
                'chatic-brand': ['Aldrich', 'sans-serif'],
                'chatic-system': ['SF Pro Display', 'sans-serif'],
            },
            fontSize: {
                'chatic-xs': '10px',
                'chatic-sm': '12px',
                'chatic-base': '14px',
                'chatic-md': '16px',
                'chatic-lg': '18px',
                'chatic-xl': '20px',
                'chatic-2xl': '23px',
                'chatic-3xl': '28px',
                'chatic-4xl': '80px',
            },
            spacing: {
                'chatic-xs': '4px',
                'chatic-sm': '8px',
                'chatic-md': '16px',
                'chatic-lg': '24px',
                'chatic-xl': '32px',
            },
            animation: {
                'typing-pulse': 'pulse 1.4s ease-in-out infinite',
            },
        },
    },
    plugins: [],
};
