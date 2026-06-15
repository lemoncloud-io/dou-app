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
                    ink: 'hsl(var(--primary-ink))',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))',
                },
                warning: {
                    DEFAULT: 'hsl(var(--warning))',
                    foreground: 'hsl(var(--warning-foreground))',
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
                rail: {
                    DEFAULT: 'hsl(var(--rail))',
                    foreground: 'hsl(var(--rail-foreground))',
                    muted: 'hsl(var(--rail-muted))',
                    elevated: 'hsl(var(--rail-elevated))',
                },
                sidebar: {
                    DEFAULT: 'hsl(var(--sidebar))',
                    foreground: 'hsl(var(--sidebar-foreground))',
                },
                // Figma design system tokens
                label: 'hsl(var(--label))',
                placeholder: 'hsl(var(--placeholder))',
                description: 'hsl(var(--description))',
                surface: 'hsl(var(--surface))',
                'main-accent': 'hsl(var(--main-accent))',
                'input-border': 'hsl(var(--input-border))',
                'focus-border': 'hsl(var(--focus-border))',
                toast: {
                    DEFAULT: 'hsl(var(--toast))',
                    foreground: 'hsl(var(--toast-foreground))',
                    muted: 'hsl(var(--toast-muted))',
                },
                'dialog-subtitle': 'hsl(var(--dialog-subtitle))',
                // Chatic custom colors
                'bubble-mine': {
                    DEFAULT: 'hsl(var(--bubble-mine))',
                    foreground: 'hsl(var(--bubble-mine-foreground))',
                },
                'bubble-other': {
                    DEFAULT: 'hsl(var(--bubble-other))',
                    foreground: 'hsl(var(--bubble-other-foreground))',
                },
                'badge-unread': {
                    DEFAULT: 'hsl(var(--badge-unread))',
                    foreground: 'hsl(var(--badge-unread-foreground))',
                },
                'badge-member': 'hsl(var(--badge-member))',
                'tab-active': 'hsl(var(--tab-active))',
                'tab-inactive': 'hsl(var(--tab-inactive))',
                overlay: 'hsl(var(--overlay))',
                // Engineering pass — layering surfaces (depth without hardcoded grays)
                elevated: 'hsl(var(--elevated))',
                hairline: 'hsl(var(--hairline))',
                well: 'hsl(var(--well))',
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
            // Semantic type scale (size / leading / tracking / weight) — controls
            // hierarchy via weight+tracking, not just size (skill Rule 1).
            fontSize: {
                display: ['1.5rem', { lineHeight: '1.875rem', letterSpacing: '-0.024em', fontWeight: '800' }],
                title: ['1.125rem', { lineHeight: '1.625rem', letterSpacing: '-0.017em', fontWeight: '700' }],
                heading: ['0.9375rem', { lineHeight: '1.375rem', letterSpacing: '-0.009em', fontWeight: '600' }],
                body: ['0.9375rem', { lineHeight: '1.45rem', letterSpacing: '-0.003em' }],
                callout: ['0.875rem', { lineHeight: '1.3rem', letterSpacing: '-0.002em' }],
                caption: ['0.8125rem', { lineHeight: '1.1rem', letterSpacing: '0' }],
                micro: ['0.72rem', { lineHeight: '0.95rem', letterSpacing: '0' }],
                overline: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em', fontWeight: '600' }],
            },
            // Restrained, tinted elevation by level. Cool --shadow-color, low opacity —
            // honest depth, not heavy decorative shadows.
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
