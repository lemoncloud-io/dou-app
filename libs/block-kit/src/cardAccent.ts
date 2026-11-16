/**
 * A webhook card's accent: the colour its type badge and in-card links take, read from the sender's
 * own `color` (the message's `source$.color`, which the server stores as sent).
 *
 * The value is untrusted. The server checks neither its shape nor its length, and a sender with no
 * token can post one, so it is only ever *read* here — matched against a name table or parsed as a
 * hex — and what the card paints is the colour this file computes, never the string that came in.
 *
 * The name table, the hex shape and the grey rule are the server's own (the emoji it puts before the
 * title), compared without case the way the server compares them. Reading them any other way would
 * let the title say 🔴 while the badge says green.
 */

/** sRGB, each channel 0–255. */
interface Rgb {
    r: number;
    g: number;
    b: number;
}

/** One theme's three colours, as `#rrggbb`. */
export interface CardAccentColors {
    /** The type badge's text. At least 4.5:1 against `badgeBackground`. */
    badgeText: string;
    badgeBackground: string;
    /** Links inside the card. At least 4.5:1 against the card in this theme. */
    link: string;
}

export interface CardAccent {
    light: CardAccentColors;
    dark: CardAccentColors;
}

/** The text a card's links and badge text must clear against its ground. */
export const CARD_ACCENT_MIN_CONTRAST = 4.5;

/**
 * The grounds the colours are measured against: each a step past every caller's `--card` in that
 * theme, so a colour that clears this one clears all of them. Light: no lighter than the darkest
 * light card (the builder's, #FCFDFB). Dark: no darker than the lightest dark card (desktop's,
 * #2E2F2D). desktop-web's contrast spec holds its `--card` to this; the other callers have to keep
 * theirs past it by hand.
 */
export const CARD_ACCENT_GROUND = { light: '#F7F7F7', dark: '#333333' } as const;

type NamedTone = 'danger' | 'warning' | 'good';

// A Map, not an object literal: the key is the sender's text, and an object would answer
// `constructor` or `__proto__` from its prototype.
const NAMES = new Map<string, NamedTone>([
    ['danger', 'danger'],
    ['red', 'danger'],
    ['warning', 'warning'],
    ['orange', 'warning'],
    ['yellow', 'warning'],
    ['good', 'good'],
    ['green', 'good'],
]);

/**
 * The design's colours for the three named tones. `danger` and `good` are the ERROR and ATTENDANCE
 * badges as drawn (base colour and its tint behind the text). The design draws no warning badge, so
 * `warning` takes the `--warning` amber all three apps already define, with a tint mixed the way the
 * design's two are.
 */
const NAMED: Record<NamedTone, { base: string; lightTint?: string }> = {
    danger: { base: '#FF4C35', lightTint: '#FDECEC' },
    warning: { base: '#F59E0B' },
    good: { base: '#43946C', lightTint: '#E4F0EA' },
};

/** How much of the colour goes into a badge's tint: about what the design's two tints hold. */
const LIGHT_TINT = 0.12;
const DARK_TINT = 0.22;

/** Below this HSL saturation a colour is grey and says nothing — the server's own cut. */
const GREY_SATURATION = 0.2;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/;

const parseHex = (value: string): Rgb | null => {
    const m = HEX.exec(value);
    if (!m) return null;
    const hex = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    };
};

const toHex = ({ r, g, b }: Rgb): string =>
    '#' +
    [r, g, b]
        .map(c =>
            Math.round(Math.min(255, Math.max(0, c)))
                .toString(16)
                .padStart(2, '0')
        )
        .join('')
        .toUpperCase();

const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = ({ r, g, b }: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const ratioOf = (a: Rgb, b: Rgb): number => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** WCAG 2 contrast ratio between two hex colours; `NaN` when either is not one, which clears no minimum. */
export const contrastRatio = (a: string, b: string): number => {
    const [x, y] = [parseHex(a.toLowerCase()), parseHex(b.toLowerCase())];
    return x && y ? ratioOf(x, y) : NaN;
};

interface Hsl {
    h: number;
    s: number;
    l: number;
}

const toHsl = ({ r, g, b }: Rgb): Hsl => {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const d = max - min;
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) {
        if (max === R) h = ((G - B) / d) % 6;
        else if (max === G) h = (B - R) / d + 2;
        else h = (R - G) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s, l };
};

const fromHsl = ({ h, s, l }: Hsl): Rgb => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
        h < 60
            ? [c, x, 0]
            : h < 120
              ? [x, c, 0]
              : h < 180
                ? [0, c, x]
                : h < 240
                  ? [0, x, c]
                  : h < 300
                    ? [x, 0, c]
                    : [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};

const mix = (color: Rgb, ground: Rgb, amount: number): Rgb => ({
    r: ground.r + (color.r - ground.r) * amount,
    g: ground.g + (color.g - ground.g) * amount,
    b: ground.b + (color.b - ground.b) * amount,
});

const fit = (color: Rgb, ground: Rgb, min: number): Rgb => {
    if (ratioOf(color, ground) >= min) return color;
    const hsl = toHsl(color);
    const step = luminance(ground) > 0.18 ? -0.005 : 0.005;
    for (let l = hsl.l; l >= 0 && l <= 1; l += step) {
        const candidate = parseHex(toHex(fromHsl({ ...hsl, l })).toLowerCase()) as Rgb;
        if (ratioOf(candidate, ground) >= min) return candidate;
    }
    return step < 0 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
};

/**
 * The colour as close to itself as reads on `ground`: unchanged when it already clears the minimum,
 * otherwise walked darker (on a light ground) or lighter (on a dark one) in lightness alone, so the
 * hue the sender chose stays. Black and white both clear 4.5:1 on either ground, so the walk ends.
 * `null` when either value is not a hex colour.
 */
export const fitContrast = (color: string, ground: string, min = CARD_ACCENT_MIN_CONTRAST): string | null => {
    const [c, g] = [parseHex(color.toLowerCase()), parseHex(ground.toLowerCase())];
    return c && g ? toHex(fit(c, g, min)) : null;
};

const hex = (value: string): Rgb => parseHex(value.toLowerCase()) as Rgb;

// Whole channel values, so the contrast is measured on the colour the page will actually paint.
const whole = (color: Rgb): Rgb => hex(toHex(color));

const colorsFor = (base: Rgb, tint: Rgb): CardAccent => {
    const [light, dark] = [hex(CARD_ACCENT_GROUND.light), hex(CARD_ACCENT_GROUND.dark)];
    const lightTint = whole(tint);
    const darkTint = whole(mix(base, dark, DARK_TINT));
    return {
        light: {
            badgeText: toHex(fit(base, lightTint, CARD_ACCENT_MIN_CONTRAST)),
            badgeBackground: toHex(lightTint),
            link: toHex(fit(base, light, CARD_ACCENT_MIN_CONTRAST)),
        },
        dark: {
            badgeText: toHex(fit(base, darkTint, CARD_ACCENT_MIN_CONTRAST)),
            badgeBackground: toHex(darkTint),
            link: toHex(fit(base, dark, CARD_ACCENT_MIN_CONTRAST)),
        },
    };
};

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

const computeAccent = (value: string): CardAccent | null => {
    const tone = NAMES.get(value);
    if (tone) {
        const { base, lightTint } = NAMED[tone];
        return colorsFor(hex(base), lightTint ? hex(lightTint) : mix(hex(base), WHITE, LIGHT_TINT));
    }
    const rgb = parseHex(value);
    if (!rgb || toHsl(rgb).s < GREY_SATURATION) return null;
    const base = whole(rgb);
    return colorsFor(base, mix(base, WHITE, LIGHT_TINT));
};

// A channel's cards all carry the same few values and a row re-renders often, so each value is
// resolved once. Bounded, because the values are whatever senders send.
const CACHE = new Map<string, CardAccent | null>();
const CACHE_LIMIT = 64;

/**
 * The accent for a sender's `color`, or `null` for the neutral card: nothing sent, a name outside the
 * table (`purple`), something that is not a colour, or a grey. `null` means the badge is the design's
 * grey one and links keep the app's own link colour.
 */
export const resolveCardAccent = (color: unknown): CardAccent | null => {
    if (typeof color !== 'string') return null;
    const value = color.trim().toLowerCase();
    if (!value) return null;
    if (CACHE.has(value)) return CACHE.get(value) ?? null;
    const accent = computeAccent(value);
    if (CACHE.size >= CACHE_LIMIT) CACHE.clear();
    CACHE.set(value, accent);
    return accent;
};
