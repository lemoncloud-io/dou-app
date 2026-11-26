const { join } = require('path');
const { mobileColors, radius } = require('../../libs/design-system/tokens/mobile/src/tailwind.cjs');

const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');

module.exports = {
    darkMode: ['class'],
    content: [
        join(__dirname, '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        join(__dirname, '../../libs/block-kit/src/**/*!(*.stories|*.spec|*.test).{ts,tsx}'),
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
            maxWidth: {
                app: 'var(--app-width, 600px)',

                reading: '30rem',
            },
            colors: mobileColors,
            fontSize: {
                title: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.017em', fontWeight: '700' }],
                heading: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.009em', fontWeight: '600' }],
                body: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.003em' }],
                callout: ['0.9375rem', { lineHeight: '1.375rem', letterSpacing: '-0.002em' }],
                caption: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0' }],
                overline: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.08em', fontWeight: '600' }],
            },
            borderRadius: radius,
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
                'snackbar-in': {
                    '0%': { transform: 'translateY(calc(100% + var(--snackbar-offset, 16px)))' },
                    '100%': { transform: 'translateY(0)' },
                },
                'snackbar-out': {
                    '0%': { transform: 'translateY(var(--radix-toast-swipe-end-y, 0px))' },
                    '100%': { transform: 'translateY(calc(100% + var(--snackbar-offset, 16px)))' },
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
                'snackbar-in': 'snackbar-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1)',
                'snackbar-out': 'snackbar-out 220ms cubic-bezier(0.4, 0, 1, 1) forwards',
                'cloud-bounce': 'cloud-bounce 600ms ease-out',
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
