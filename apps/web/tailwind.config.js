const { join } = require('path');

const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');
const plugin = require('tailwindcss/plugin');

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
                'chatic-accent': 'hsl(var(--chatic-accent))',
                'chatic-50': 'hsl(var(--chatic-50))',
                'chatic-100': 'hsl(var(--chatic-100))',
                'chatic-300': 'hsl(var(--chatic-300))',
                'chatic-400': 'hsl(var(--chatic-400))',
                'chatic-500': 'hsl(var(--chatic-500))',
                'chatic-600': 'hsl(var(--chatic-600))',
                'chatic-700': 'hsl(var(--chatic-700))',
                'chatic-800': 'hsl(var(--chatic-800))',

                'chatic-text': {
                    100: 'hsl(var(--chatic-100))',
                    300: 'hsl(var(--chatic-300))',
                    400: 'hsl(var(--chatic-400))',
                    500: 'hsl(var(--chatic-500))',
                    600: 'hsl(var(--chatic-600))',
                    700: 'hsl(var(--chatic-700))',
                    800: 'hsl(var(--chatic-800))',
                    primary: 'hsl(var(--chatic-primary))',
                },
            },
            boxShadow: {
                chatic: '0 0 8px 0 rgba(0, 0, 0, 0.10)',
            },
            fontFamily: {
                chatic: ['Pretendard', 'Aldrich', 'sans-serif'],
                'chatic-brand': ['Aldrich', 'sans-serif'],
                'chatic-system': ['SF Pro Display', 'sans-serif'],
            },
            animation: {
                'typing-pulse': 'pulse 1.4s ease-in-out infinite',
            },
        },
    },
    plugins: [
        require('tailwindcss-animate'),
        plugin(({ addUtilities }) =>
            addUtilities({
                '.scrollbar-hide': {
                    '-ms-overflow-style': 'none',
                    'scrollbar-width': 'none',
                    '&::-webkit-scrollbar': {
                        display: 'none',
                    },
                },
            })
        ),
    ],
};
