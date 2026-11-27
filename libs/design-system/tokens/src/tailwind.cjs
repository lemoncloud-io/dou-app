const hsl = token => `hsl(var(--${token}))`;

const commonColors = {
    border: hsl('border'),
    input: hsl('input'),
    ring: hsl('ring'),
    background: hsl('background'),
    foreground: hsl('foreground'),
    primary: {
        DEFAULT: hsl('primary'),
        foreground: hsl('primary-foreground'),
        ink: hsl('primary-ink'),
    },
    link: hsl('link'),
    secondary: {
        DEFAULT: hsl('secondary'),
        foreground: hsl('secondary-foreground'),
    },
    destructive: {
        DEFAULT: hsl('destructive'),
        foreground: hsl('destructive-foreground'),
    },
    muted: {
        DEFAULT: hsl('muted'),
        foreground: hsl('muted-foreground'),
    },
    accent: {
        DEFAULT: hsl('accent'),
        foreground: hsl('accent-foreground'),
    },
    popover: {
        DEFAULT: hsl('popover'),
        foreground: hsl('popover-foreground'),
    },
    card: {
        DEFAULT: hsl('card'),
        foreground: hsl('card-foreground'),
    },
    label: hsl('label'),
    placeholder: hsl('placeholder'),
    description: hsl('description'),
    surface: hsl('surface'),
    'main-accent': hsl('main-accent'),
    'input-border': hsl('input-border'),
    'focus-border': hsl('focus-border'),
    toast: {
        DEFAULT: hsl('toast'),
        foreground: hsl('toast-foreground'),
        muted: hsl('toast-muted'),
    },
    'dialog-subtitle': hsl('dialog-subtitle'),
    'bubble-mine': {
        DEFAULT: hsl('bubble-mine'),
        foreground: hsl('bubble-mine-foreground'),
    },
    'bubble-other': {
        DEFAULT: hsl('bubble-other'),
        foreground: hsl('bubble-other-foreground'),
    },
    'badge-unread': {
        DEFAULT: hsl('badge-unread'),
        foreground: hsl('badge-unread-foreground'),
    },
    'badge-member': hsl('badge-member'),
    'tab-active': hsl('tab-active'),
    'tab-inactive': hsl('tab-inactive'),
    overlay: hsl('overlay'),
    hairline: hsl('hairline'),
    well: hsl('well'),
    'code-inline': hsl('code-inline'),
};

const radius = {
    lg: 'var(--radius)',
    md: 'calc(var(--radius) - 2px)',
    sm: 'calc(var(--radius) - 4px)',
};

module.exports = { hsl, commonColors, radius };
