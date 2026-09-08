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
            maxWidth: {
                /**
                 * The app's own width. `apps/web` renders inside a phone-sized WebView, so every
                 * screen is laid out for that width; on anything wider (a tablet, a desktop browser
                 * opening an invite link) the content caps here and centres rather than stretching
                 * a phone layout across the viewport.
                 *
                 * Always paired with `w-full` and `mx-auto`: fill whatever the device gives, stop
                 * here, stay centred.
                 *
                 * The number lives in `--app-width` (`src/styles.css`), not here: the overlay
                 * primitives in `libs/ui-kit` are `fixed` and portalled out of the shell, so they
                 * have to re-declare the cap themselves and cannot read a Tailwind token that only
                 * this app's config defines. One variable, both readers.
                 */
                app: 'var(--app-width, 430px)',
            },
            colors: {
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))',
                    // Readable-on-background ink, not the lime fill. `--primary` is a brand
                    // surface colour here; as text it is illegible on white, so links and
                    // mentions in a shared message renderer resolve to this instead.
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
                // Figma design system tokens
                label: 'hsl(var(--label))',
                placeholder: 'hsl(var(--placeholder))',
                description: 'hsl(var(--description))',
                surface: 'hsl(var(--surface))',
                'main-accent': 'hsl(var(--main-accent))',
                verified: 'hsl(var(--verified))',
                'point-blue': 'hsl(var(--point-blue))',
                'point-pink': 'hsl(var(--point-pink))',
                'input-border': 'hsl(var(--input-border))',
                'focus-border': 'hsl(var(--focus-border))',
                'brand-ink': 'hsl(var(--brand-ink))',
                'control-idle': 'hsl(var(--control-idle))',
                'avatar-ring': 'hsl(var(--avatar-ring))',
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
                // Layering surfaces the shared message renderer draws with — a rule inside a
                // message, and the recessed ground under a code block.
                hairline: 'hsl(var(--hairline))',
                well: 'hsl(var(--well))',
                warning: 'hsl(var(--warning))',
            },
            // Semantic type scale for `libs/block-kit`'s renderer, which both apps share.
            //
            // The names match apps/desktop-web's scale on purpose — the renderer asks for
            // `text-body` and each app answers with its own value. Body is 16px here because
            // that is what a message bubble already uses (`MessageBubble`), where desktop's is
            // 15px; copying desktop's numbers would make block text smaller than the text
            // beside it. Only the steps that renderer uses are defined; the rest of this app
            // still sizes type with utilities.
            fontSize: {
                title: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.017em', fontWeight: '700' }],
                heading: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.009em', fontWeight: '600' }],
                body: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.003em' }],
                callout: ['0.9375rem', { lineHeight: '1.375rem', letterSpacing: '-0.002em' }],
                caption: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0' }],
                overline: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.08em', fontWeight: '600' }],
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
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
