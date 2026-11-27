const { hsl, commonColors, radius } = require('../../src/tailwind.cjs');

const desktopColors = {
    ...commonColors,
    presence: {
        online: hsl('presence-online'),
    },
    profile: {
        disc: hsl('profile-disc'),
        'disc-foreground': hsl('profile-disc-foreground'),
    },
    swatch: {
        light: hsl('swatch-light'),
        dark: hsl('swatch-dark'),
        border: hsl('swatch-border'),
    },
    warning: {
        DEFAULT: hsl('warning'),
        foreground: hsl('warning-foreground'),
    },
    rail: {
        DEFAULT: hsl('rail'),
        foreground: hsl('rail-foreground'),
        muted: hsl('rail-muted'),
        elevated: hsl('rail-elevated'),
        active: {
            DEFAULT: hsl('rail-active'),
            foreground: hsl('rail-active-foreground'),
        },
    },
    sidebar: {
        DEFAULT: hsl('sidebar'),
        foreground: hsl('sidebar-foreground'),
    },
    'control-border': hsl('control-border'),
    favorite: hsl('favorite'),
    'on-overlay': hsl('on-overlay'),
    'tile-active': hsl('tile-active'),
    elevated: hsl('elevated'),
};

module.exports = { desktopColors, radius };
