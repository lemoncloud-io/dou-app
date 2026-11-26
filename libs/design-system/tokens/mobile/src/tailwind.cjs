const { hsl, commonColors, radius } = require('../../src/tailwind.cjs');

const mobileColors = {
    ...commonColors,
    verified: hsl('verified'),
    'point-blue': hsl('point-blue'),
    'point-pink': hsl('point-pink'),
    'point-orange': hsl('point-orange'),
    'alert-red': hsl('alert-red'),
    'chip-ink': hsl('chip-ink'),
    'chip-surface': hsl('chip-surface'),
    'chip-border': hsl('chip-border'),
    'tab-idle': hsl('tab-idle'),
    'action-soft': hsl('action-soft'),
    'notify-name': hsl('notify-name'),
    'notify-ink': hsl('notify-ink'),
    'notify-muted': hsl('notify-muted'),
    'brand-ink': hsl('brand-ink'),
    'control-idle': hsl('control-idle'),
    'avatar-ring': hsl('avatar-ring'),
    'avatar-stroke': hsl('avatar-stroke'),
    'control-surface': hsl('control-surface'),
    'nav-ink': hsl('nav-ink'),
    'glyph-green': hsl('glyph-green'),
    'glyph-indigo': hsl('glyph-indigo'),
    'glyph-cyan': hsl('glyph-cyan'),
    'tile-ring': hsl('tile-ring'),
    'media-tile': {
        DEFAULT: hsl('media-tile'),
        foreground: hsl('media-tile-foreground'),
    },
    warning: hsl('warning'),
};

module.exports = { mobileColors, radius };
