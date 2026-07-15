const { join } = require('path');

/**
 * Tailwind config for the web-ui-kit library. Consumed by the Storybook showcase
 * so components render with the same tokens the app resolves. apps/web keeps its
 * own config; the token names below intentionally match it (plus avatar tokens).
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
    darkMode: ['class'],
    content: [
        join(__dirname, 'src/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        join(__dirname, 'src/**/*.stories.{ts,tsx}'),
    ],
    theme: {
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
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))',
                },
                // Figma design system tokens
                label: 'hsl(var(--label))',
                placeholder: 'hsl(var(--placeholder))',
                description: 'hsl(var(--description))',
                surface: 'hsl(var(--surface))',
                'main-accent': 'hsl(var(--main-accent))',
                'input-border': 'hsl(var(--input-border))',
                'focus-border': 'hsl(var(--focus-border))',
                'brand-ink': 'hsl(var(--brand-ink))',
                'control-idle': 'hsl(var(--control-idle))',
                'avatar-ring': 'hsl(var(--avatar-ring))',
                'bubble-mine': {
                    DEFAULT: 'hsl(var(--bubble-mine))',
                    foreground: 'hsl(var(--bubble-mine-foreground))',
                },
                'bubble-other': {
                    DEFAULT: 'hsl(var(--bubble-other))',
                    foreground: 'hsl(var(--bubble-other-foreground))',
                },
                toast: {
                    DEFAULT: 'hsl(var(--toast))',
                    foreground: 'hsl(var(--toast-foreground))',
                },
                verified: 'hsl(var(--verified))',
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
            // Safe-area insets. `--safe-*` is injected by the native WebView; falls
            // back to 0px on the web / Storybook. Mirrors apps/web's spacing tokens.
            spacing: {
                'safe-top': 'var(--safe-top, 0px)',
                'safe-bottom': 'var(--safe-bottom, 0px)',
                'safe-left': 'var(--safe-left, 0px)',
                'safe-right': 'var(--safe-right, 0px)',
            },
        },
    },
    plugins: [],
};
