const { join } = require('path');
const { desktopColors, radius } = require('../../libs/design-system/tokens/desktop/src/tailwind.cjs');

const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');

module.exports = {
    darkMode: ['class'],
    content: [
        join(__dirname, '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        join(__dirname, '../../libs/{ui-kit,block-kit}/src/**/*!(*.stories|*.spec|*.test).{ts,tsx}'),
        join(__dirname, '../../libs/design-system/components/desktop/src/**/*!(*.stories|*.spec|*.test).{ts,tsx}'),
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
            zIndex: {
                raised: '10',
                float: '20',
                overlay: '25',
                drawer: '30',
                toast: '40',
                popover: '50',
                alert: '60',
            },
            colors: desktopColors,
            borderRadius: radius,
            fontSize: {
                headline: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.012em' }],
                lead: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.006em' }],
                tiny: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0' }],
                nano: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0' }],
                display: ['1.5rem', { lineHeight: '1.875rem', letterSpacing: '-0.024em', fontWeight: '800' }],
                title: ['1.125rem', { lineHeight: '1.625rem', letterSpacing: '-0.017em', fontWeight: '700' }],
                heading: ['0.9375rem', { lineHeight: '1.375rem', letterSpacing: '-0.009em', fontWeight: '600' }],
                body: ['0.9375rem', { lineHeight: '1.45rem', letterSpacing: '-0.003em' }],
                callout: ['0.875rem', { lineHeight: '1.3rem', letterSpacing: '-0.002em' }],
                caption: ['0.8125rem', { lineHeight: '1.1rem', letterSpacing: '0' }],
                micro: ['0.72rem', { lineHeight: '0.95rem', letterSpacing: '0' }],
                overline: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em', fontWeight: '600' }],
            },
            boxShadow: {
                raised: '0 1px 2px 0 hsl(var(--shadow-color) / 0.04), 0 1px 3px -1px hsl(var(--shadow-color) / 0.07)',
                overlay:
                    '0 2px 6px -2px hsl(var(--shadow-color) / 0.1), 0 10px 28px -10px hsl(var(--shadow-color) / 0.2)',
                well: 'inset 0 1px 2px 0 hsl(var(--shadow-color) / 0.05)',
            },
            transitionTimingFunction: {
                tactile: 'cubic-bezier(0.16, 1, 0.3, 1)',
            },
            keyframes: {
                'slide-in-from-top': {
                    '0%': { transform: 'translateY(-100%)' },
                    '100%': { transform: 'translateY(0)' },
                },
                'slide-in-from-bottom': {
                    '0%': { transform: 'translateY(100%)' },
                    '100%': { transform: 'translateY(0)' },
                },
                'slide-out-to-right': {
                    '0%': { transform: 'translateX(0)' },
                    '100%': { transform: 'translateX(100%)' },
                },
                'slide-out-to-top': {
                    '0%': { transform: 'translateY(0)' },
                    '100%': { transform: 'translateY(-100%)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'fade-out': {
                    '0%': { opacity: '1' },
                    '100%': { opacity: '0' },
                },
                'toast-in': {
                    '0%': { opacity: '0', transform: 'translateY(-8px) scale(0.98)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
                'toast-out': {
                    '0%': { opacity: '1', transform: 'translateY(0)' },
                    '100%': { opacity: '0', transform: 'translateY(-6px)' },
                },
                'cloud-bounce': {
                    '0%': { transform: 'scale(1) rotate(0deg)' },
                    '20%': { transform: 'scale(1.2) rotate(-10deg)' },
                    '40%': { transform: 'scale(0.95) rotate(5deg)' },
                    '60%': { transform: 'scale(1.1) rotate(-3deg)' },
                    '80%': { transform: 'scale(0.98) rotate(1deg)' },
                    '100%': { transform: 'scale(1) rotate(0deg)' },
                },
            },
            animation: {
                'slide-in-from-top': 'slide-in-from-top 0.3s ease-out',
                'slide-in-from-bottom': 'slide-in-from-bottom 0.3s ease-out',
                'slide-out-to-right': 'slide-out-to-right 0.3s ease-in',
                'slide-out-to-top': 'slide-out-to-top 0.3s ease-in',
                'fade-in': 'fade-in 0.2s ease-out',
                'fade-out': 'fade-out 0.2s ease-in',
                'toast-in': 'toast-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                'toast-out': 'toast-out 0.16s ease-in forwards',
                'cloud-bounce': 'cloud-bounce 600ms ease-out',
            },
            width: {
                rail: '80px',
            },
            spacing: {
                'safe-top': 'var(--safe-top, 0px)',
                'safe-bottom': 'var(--safe-bottom, 0px)',
                'safe-left': 'var(--safe-left, 0px)',
                'safe-right': 'var(--safe-right, 0px)',
                keyboard: 'var(--keyboard-height, 0px)',
            },
            inset: {
                'safe-top': 'var(--safe-top, 0px)',
                'safe-bottom': 'var(--safe-bottom, 0px)',
                'safe-left': 'var(--safe-left, 0px)',
                'safe-right': 'var(--safe-right, 0px)',
                keyboard: 'var(--keyboard-height, 0px)',
            },
        },
    },
    plugins: [require('tailwindcss-animate')],
};
