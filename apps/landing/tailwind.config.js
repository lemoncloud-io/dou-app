const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ['class'],
    content: [
        join(__dirname, '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        ...createGlobPatternsForDependencies(__dirname),
    ],
    theme: {
        extend: {
            colors: {
                border: 'hsl(var(--border))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))',
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))',
                },
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))',
                },
                navy: '#102346',
                'main-green': '#B0EA10',
                subtitle: '#53555B',
                'desc-alt': '#3A3C40',
                'feature-orange': '#F87A26',
                'feature-blue': '#266FF8',
                // Banner and badge colours for the subscription pages: a foreground for text and
                // icons, and a pale background behind it. Values live in styles.css.
                status: {
                    success: 'hsl(var(--status-success))',
                    'success-bg': 'hsl(var(--status-success-bg))',
                    warning: 'hsl(var(--status-warning))',
                    'warning-bg': 'hsl(var(--status-warning-bg))',
                    danger: 'hsl(var(--status-danger))',
                    'danger-bg': 'hsl(var(--status-danger-bg))',
                    info: 'hsl(var(--status-info))',
                    'info-bg': 'hsl(var(--status-info-bg))',
                },
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                scaleIn: {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
            },
            animation: {
                fadeIn: 'fadeIn 0.2s ease-out',
                scaleIn: 'scaleIn 0.2s ease-out',
            },
        },
    },
    plugins: [],
};
