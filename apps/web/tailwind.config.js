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
                // Chatic Design System Colors
                'chatic-primary': '#3968c3',
                'chatic-primary-border': '#3968c3',
                'chatic-primary-shadow': '#c7daff',
                'chatic-neutral': {
                    50: '#F4F5F5',
                    100: '#EAEAEC',
                    200: '#DFE0E2',
                    300: '#CFD0D3',
                    400: '#BABCC0',
                    500: '#9FA2A7',
                    600: '#84888F',
                    700: '#53555B',
                    800: '#3A3C40',
                    900: '#222325',
                },
                'chatic-text': {
                    primary: '#3A3C40',
                    secondary: '#BABCC0',
                    tertiary: '#84888F',
                    inverse: '#FFFFFF',
                    accent: '#081837',
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
        },
    },
    plugins: [],
};
