export interface ShellColors {
    cloudRail: string;
    navRail: string;
    list: string;
}

export type ShellMode = 'light' | 'dark';

export type ShellTokenSet = Record<string, string>;

export interface ShellTokens {
    root: ShellTokenSet;
    cloud: ShellTokenSet;
    nav: ShellTokenSet;
    sidebar: ShellTokenSet;
}

export const PRESET_COLORS = {
    mist: { cloudRail: '#D6D9DF', navRail: '#E5E7EB', list: '#F6F7F9' },
    midnight: { cloudRail: '#12141E', navRail: '#1B1E2B', list: '#F3F4F7' },
    forest: { cloudRail: '#103225', navRail: '#1C4D3A', list: '#EFF5F2' },
    ocean: { cloudRail: '#0C2448', navRail: '#164078', list: '#EEF3FA' },
    plum: { cloudRail: '#281230', navRail: '#462054', list: '#F5F0F7' },
    lemon: { cloudRail: '#12131A', navRail: '#B0EA10', list: '#F8FCEC' },
} as const satisfies Record<string, ShellColors>;

export const isHexColor = (value: unknown): value is string =>
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export const isShellColors = (value: unknown): value is ShellColors => {
    if (!value || typeof value !== 'object') return false;
    const { cloudRail, navRail, list } = value as Partial<ShellColors>;
    return isHexColor(cloudRail) && isHexColor(navRail) && isHexColor(list);
};

interface Hsl {
    h: number;
    s: number;
    l: number;
}

const parseHsl = (value: string): Hsl => {
    const [h = 0, s = 0, l = 0] = value.split(/\s+/).map(part => parseFloat(part));
    return { h, s, l };
};

const formatHsl = ({ h, s, l }: Hsl): string => `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;

const hexToHsl = (hex: string): Hsl => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l: l * 100 };
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
};

export const luminance = (hsl: string): number => {
    const { h, s, l } = parseHsl(hsl);
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const channel = (n: number) => {
        const k = (n + h / 30) % 12;
        const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
};

export const contrast = (a: string, b: string): number => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const clampL = (c: Hsl, l: number): Hsl => ({ ...c, l: Math.max(0, Math.min(100, l)) });

const settle = (c: Hsl, direction: 1 | -1, ok: (c: Hsl) => boolean): Hsl => {
    let current = c;
    for (let i = 0; i <= 100 && !ok(current); i++) current = clampL(current, current.l + direction);
    return current;
};

const passes = (fg: string, bg: Hsl, minimum: number): boolean => contrast(fg, formatHsl(bg)) >= minimum;

export const PAGE_TOKENS = {
    light: {
        'rail-foreground': '220 5% 24%',
        'focus-ring': '76 80% 26%',
        'muted-foreground': '218 5% 40%',
        'rail-active': '76 87% 49%',
        'rail-active-foreground': '0 0% 10%',
    },
    dark: {
        'rail-foreground': '60 2% 76%',
        'muted-foreground': '82 5% 65%',
        'focus-ring': '76 87% 49%',
    },
} as const;

const WHITE = '0 0% 100%';
const LIGHT_RAIL_TEXT = PAGE_TOKENS.light['rail-foreground'];
const LIGHT_FOCUS_RING = PAGE_TOKENS.light['focus-ring'];
const LIGHT_MUTED_TEXT = PAGE_TOKENS.light['muted-foreground'];
const LIME = PAGE_TOKENS.light['rail-active'];
const INK = PAGE_TOKENS.light['rail-active-foreground'];
const DARK_RAIL_TEXT = PAGE_TOKENS.dark['rail-foreground'];
const DARK_MUTED_TEXT = PAGE_TOKENS.dark['muted-foreground'];
const DARK_RAIL_MUTED_TEXT = '0 0% 72%';
const NEAR_BLACK = '232 18% 9%';
const STEP_RATIO = 1.1;
export const OPEN_TILE_RATIO = 1.5;

const openTile = (rail: Hsl): ShellTokenSet =>
    contrast(LIME, formatHsl(rail)) < OPEN_TILE_RATIO && Math.round(rail.s) >= 20
        ? { 'rail-active': NEAR_BLACK, 'rail-active-foreground': WHITE }
        : { 'rail-active': LIME, 'rail-active-foreground': INK };

const lightRail = (picked: Hsl): { rail: Hsl; scope: ShellTokenSet } => {
    const dark = contrast(WHITE, formatHsl(picked)) >= contrast(LIGHT_RAIL_TEXT, formatHsl(picked));
    if (dark) {
        const tile = (c: Hsl): Hsl => ({ h: c.h, s: Math.min(c.s, 12), l: Math.min(c.l + 8, 26) });
        const rail = settle(
            picked,
            -1,
            c =>
                passes(WHITE, c, 4.5) &&
                passes(LIME, c, 3) &&
                passes(WHITE, tile(c), 4.5) &&
                passes(DARK_RAIL_MUTED_TEXT, tile(c), 4.5)
        );
        const ground = formatHsl(tile(rail));
        const edge = formatHsl(clampL(tile(rail), tile(rail).l + 6));
        return {
            rail,
            scope: {
                'rail-foreground': WHITE,
                foreground: WHITE,
                'muted-foreground': DARK_RAIL_MUTED_TEXT,
                background: ground,
                accent: ground,
                border: edge,
                hairline: edge,
                'focus-ring': LIME,
            },
        };
    }
    const hover = (c: Hsl): Hsl => clampL(c, c.l - 6);
    const rail = settle(
        picked,
        1,
        c => passes(LIGHT_RAIL_TEXT, c, 4.5) && passes(LIGHT_RAIL_TEXT, hover(c), 4.5) && passes(LIGHT_FOCUS_RING, c, 3)
    );
    return { rail, scope: { 'rail-foreground': LIGHT_RAIL_TEXT, accent: formatHsl(hover(rail)) } };
};

const lightList = (picked: Hsl): ShellTokenSet & { sidebar: string } => {
    const step = (c: Hsl): Hsl =>
        settle(
            { ...clampL(c, c.l - 3), s: Math.min(c.s, 45) },
            -1,
            s => contrast(formatHsl(c), formatHsl(s)) >= STEP_RATIO
        );
    const list = settle(picked, 1, c => passes(LIGHT_MUTED_TEXT, step(c), 4.5));
    const darker = formatHsl(step(list));
    return { sidebar: formatHsl(list), accent: darker, muted: darker, well: darker };
};

const deriveLight = (colors: ShellColors): ShellTokens => {
    const cloud = lightRail(hexToHsl(colors.cloudRail));
    const nav = lightRail(hexToHsl(colors.navRail));
    const { sidebar, ...listScope } = lightList(hexToHsl(colors.list));
    return {
        root: {
            rail: formatHsl(cloud.rail),
            'rail-muted': formatHsl(cloud.rail),
            'rail-elevated': formatHsl(nav.rail),
            sidebar,
        },
        cloud: cloud.scope,
        nav: { ...nav.scope, ...openTile(nav.rail) },
        sidebar: listScope,
    };
};

const deriveDark = (colors: ShellColors): ShellTokens => {
    const tint = (hex: string, l: number, maxS: number): Hsl => {
        const { h, s } = hexToHsl(hex);
        return { h, s: Math.min(s, maxS), l };
    };
    const cloud = settle(tint(colors.cloudRail, 7, 25), -1, c => passes(DARK_RAIL_TEXT, c, 4.5));
    const navHover = (c: Hsl): Hsl => clampL(c, c.l + 4);
    const nav = settle(
        tint(colors.navRail, 18, 25),
        -1,
        c => passes(DARK_RAIL_TEXT, c, 4.5) && passes(DARK_RAIL_TEXT, navHover(c), 4.5)
    );
    const listHover = (c: Hsl): Hsl =>
        settle(clampL(c, c.l + 3), 1, s => contrast(formatHsl(c), formatHsl(s)) >= STEP_RATIO);
    const list = settle(tint(colors.list, 18, 20), -1, c => passes(DARK_MUTED_TEXT, listHover(c), 4.5));
    const sunk = formatHsl(clampL(list, list.l - 11));
    return {
        root: {
            rail: formatHsl(cloud),
            'rail-muted': formatHsl(cloud),
            'rail-elevated': formatHsl(nav),
            sidebar: formatHsl(list),
        },
        cloud: {},
        nav: { accent: formatHsl(navHover(nav)) },
        sidebar: { accent: formatHsl(listHover(list)), muted: sunk, well: sunk },
    };
};

export const derivePaletteTokens = (colors: ShellColors, mode: ShellMode): ShellTokens =>
    mode === 'dark' ? deriveDark(colors) : deriveLight(colors);

const block = (selector: string, tokens: ShellTokenSet): string => {
    const lines = Object.entries(tokens).map(([name, value]) => `    --${name}: ${value};`);
    return lines.length ? `${selector} {\n${lines.join('\n')}\n}` : '';
};

export const shellPaletteCss = (colors: ShellColors, scope: string, { dark }: { dark: boolean }): string => {
    const modes: [ShellMode, string][] = [['light', ':root:not(.dark)']];
    if (dark) modes.push(['dark', ':root.dark']);
    return modes
        .flatMap(([mode, prefix]) => {
            const tokens = derivePaletteTokens(colors, mode);
            const base = scope ? `${prefix} ${scope}` : prefix;
            return [
                block(base, tokens.root),
                block(`${base} [data-shell-rail='cloud']`, tokens.cloud),
                block(`${base} [data-shell-rail='nav']`, tokens.nav),
                block(`${base} [data-shell-sidebar]`, tokens.sidebar),
            ];
        })
        .filter(Boolean)
        .join('\n');
};
