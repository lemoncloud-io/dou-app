#!/usr/bin/env node
/**
 * Generate the alternate app icons from one logo master plus a background per icon.
 *
 * Usage: node scripts/generate-app-icons.js
 *
 * Every generated icon keeps the logo exactly as the primary icon draws it — same art, same
 * size, same position — and only the background changes. So the inputs are one transparent
 * 1024 px logo (`apps/mobile/app-icons/mascot.png`) and the background specs in `ICONS` below;
 * everything else is derived:
 *
 * - iOS: one `<Id>.appiconset` per icon, every size the existing sets carry.
 * - Android: one shared foreground and monochrome layer (the logo alone), a vector gradient
 *   background per icon, the adaptive-icon XML, and legacy bitmaps for API 24–25. Plus one
 *   notification small icon — the monochrome logo cropped to the status bar's 24 dp — shared by
 *   every icon, since the logo is the same in all of them.
 * - Web: the 180 px preview the app icon sheet shows.
 *
 * Registering an icon (Info.plist, AndroidManifest alias, the mobile icon list, translations)
 * stays a manual step: those files carry other settings, and rewriting them from here would
 * put this script in charge of more than the pictures. `apps/mobile/docs/native/app-icons.md` lists
 * the steps.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const CONFIG = {
    masterPath: 'apps/mobile/app-icons/mascot.png',
    iosAssetsDir: 'apps/mobile/ios/Chatic/Images.xcassets',
    androidResDir: 'apps/mobile/android/app/src/main/res',
    webPreviewDir: 'apps/web/public/assets/app-icons',
    webPreviewSize: 180,
};

/**
 * `accent` is the one colour that stands for the icon where Android takes a single colour: the
 * notification's accent, the circle behind the small icon while that icon is the active one. A
 * gradient background has no single colour, so it names the stop that reads as the icon at a glance.
 *
 * Backgrounds are in icon space: (0,0) is the top-left of the visible icon, (1,1) the
 * bottom-right, and a radial radius is a fraction of the icon's side.
 *
 * The primary icon is generated too, not only the alternates: when each icon was drawn by
 * hand the logo came out a few percent larger in one than another, and switching icons made
 * the logo jump. One master drawn by one script cannot drift.
 */
const ICONS = [
    { id: 'DefaultIcon', key: 'default', accent: '#B0EA10', background: { type: 'solid', color: '#B0EA10' } },
    { id: 'WhiteIcon', key: 'white', accent: '#FFFFFF', background: { type: 'solid', color: '#FFFFFF' } },
    {
        id: 'MidnightIcon',
        key: 'midnight',
        accent: '#33333F',
        background: { type: 'radial', center: [0.5, 0.42], radius: 0.72, stops: ['#33333F', '#08080B'] },
    },
    {
        id: 'AuroraIcon',
        key: 'aurora',
        accent: '#3B82F6',
        background: { type: 'linear', from: [0, 0], to: [1, 1], stops: ['#3BE8C4', '#3B82F6', '#8B5CF6'] },
    },
    {
        id: 'SkyIcon',
        key: 'sky',
        accent: '#5BB8FF',
        background: { type: 'linear', from: [0, 0], to: [0, 1], stops: ['#5BB8FF', '#D2EEFF'] },
    },
];

/** The sizes the existing hand-made sets carry, so a generated set is interchangeable with them. */
const IOS_IMAGES = [
    { size: '60x60', scale: '3x', px: 180 },
    { size: '40x40', scale: '2x', px: 80 },
    { size: '40x40', scale: '3x', px: 120 },
    { size: '60x60', scale: '2x', px: 120 },
    { size: '57x57', scale: '1x', px: 57 },
    { size: '29x29', scale: '2x', px: 58 },
    { size: '29x29', scale: '1x', px: 29 },
    { size: '29x29', scale: '3x', px: 87 },
    { size: '57x57', scale: '2x', px: 114 },
    { size: '20x20', scale: '2x', px: 40 },
    { size: '20x20', scale: '3x', px: 60 },
    { size: '1024x1024', scale: '1x', px: 1024, idiom: 'ios-marketing' },
];

const ANDROID_DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/**
 * Adaptive icons draw on a 108 dp canvas of which a launcher shows the middle 72 dp. Placing
 * the whole iOS composition in that 72 dp square keeps the logo where the iOS icon has it,
 * and the logo still clears the 66 dp safe circle: its farthest opaque pixel sits 456 px from
 * the centre of the 1024 master, inside the 469 px the safe circle allows at that scale.
 */
const ADAPTIVE_CANVAS_DP = 108;
const ADAPTIVE_VISIBLE_DP = 72;
const ADAPTIVE_INSET_DP = (ADAPTIVE_CANVAS_DP - ADAPTIVE_VISIBLE_DP) / 2;
const LEGACY_ICON_DP = 48;

const SHARED_FOREGROUND = 'ic_launcher_mascot_foreground';
const SHARED_MONOCHROME = 'ic_launcher_mascot_monochrome';

/**
 * The notification small icon. Android draws it from its alpha alone, tinted by the system, so
 * passing it the coloured launcher icon (an opaque square) shows a plain grey square. It gets the
 * same cut-out silhouette as the themed layer instead, cropped to the logo: the status bar icon is
 * 24 dp with 1 dp of padding, and the adaptive canvas's margins would shrink the logo to a dot.
 */
const NOTIFICATION_ICON = 'ic_notification';
const NOTIFICATION_ICON_DP = 24;
const NOTIFICATION_LIVE_DP = 22;
const ACCENTS_XML = 'values/ic_launcher_accents.xml';

const GENERATED_NOTE = 'Generated by scripts/generate-app-icons.js. Edit the script, not this file.';

/** Map an icon-space coordinate (0..1) to the adaptive canvas (0..108 dp). */
function toAdaptiveDp(u) {
    return round(ADAPTIVE_INSET_DP + u * ADAPTIVE_VISIBLE_DP);
}

function round(n) {
    return Math.round(n * 1000) / 1000;
}

/** `#RRGGBB` → Android's `#AARRGGBB`. */
function androidColor(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Expected #RRGGBB, got ${hex}`);
    return `#FF${hex.slice(1).toUpperCase()}`;
}

function stopOffsets(stops) {
    if (stops.length < 2) throw new Error('A gradient needs at least two stops');
    return stops.map((color, i) => ({ offset: round(i / (stops.length - 1)), color }));
}

const VECTOR_OPEN = `<?xml version="1.0" encoding="utf-8"?>
<!-- ${GENERATED_NOTE} -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="${ADAPTIVE_CANVAS_DP}dp"
    android:height="${ADAPTIVE_CANVAS_DP}dp"
    android:viewportWidth="${ADAPTIVE_CANVAS_DP}"
    android:viewportHeight="${ADAPTIVE_CANVAS_DP}">`;
const FULL_CANVAS_PATH = `M0,0h${ADAPTIVE_CANVAS_DP}v${ADAPTIVE_CANVAS_DP}h-${ADAPTIVE_CANVAS_DP}z`;

/** The background layer as a vector drawable, so it stays sharp at every density. */
function androidBackgroundXml(background) {
    if (background.type === 'solid') {
        return `${VECTOR_OPEN}
    <path
        android:fillColor="${androidColor(background.color)}"
        android:pathData="${FULL_CANVAS_PATH}" />
</vector>
`;
    }
    let attrs;
    if (background.type === 'linear') {
        attrs = [
            'android:type="linear"',
            `android:startX="${toAdaptiveDp(background.from[0])}"`,
            `android:startY="${toAdaptiveDp(background.from[1])}"`,
            `android:endX="${toAdaptiveDp(background.to[0])}"`,
            `android:endY="${toAdaptiveDp(background.to[1])}"`,
        ];
    } else if (background.type === 'radial') {
        attrs = [
            'android:type="radial"',
            `android:centerX="${toAdaptiveDp(background.center[0])}"`,
            `android:centerY="${toAdaptiveDp(background.center[1])}"`,
            `android:gradientRadius="${round(background.radius * ADAPTIVE_VISIBLE_DP)}"`,
        ];
    } else {
        throw new Error(`Unknown background type: ${background.type}`);
    }
    const items = stopOffsets(background.stops)
        .map(s => `                <item android:offset="${s.offset}" android:color="${androidColor(s.color)}" />`)
        .join('\n');
    return `${VECTOR_OPEN}
    <path android:pathData="${FULL_CANVAS_PATH}">
        <aapt:attr name="android:fillColor">
            <gradient
                ${attrs.join('\n                ')}>
${items}
            </gradient>
        </aapt:attr>
    </path>
</vector>
`;
}

/** One `notification_accent_<key>` colour per icon, read through each launcher alias's meta-data. */
function accentsXml(icons = ICONS) {
    const colors = icons
        .map(icon => `    <color name="notification_accent_${icon.key}">${androidColor(icon.accent)}</color>`)
        .join('\n');
    return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${GENERATED_NOTE} -->
<resources>
${colors}
</resources>
`;
}

function adaptiveIconXml(key) {
    return `<?xml version="1.0" encoding="utf-8"?>
<!-- ${GENERATED_NOTE} -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_${key}_background" />
    <foreground android:drawable="@mipmap/${SHARED_FOREGROUND}" />
    <monochrome android:drawable="@mipmap/${SHARED_MONOCHROME}" />
</adaptive-icon>
`;
}

function iosContentsJson() {
    const images = IOS_IMAGES.map(img => ({
        size: img.size,
        'expected-size': String(img.px),
        filename: `${img.px}.png`,
        idiom: img.idiom || 'iphone',
        scale: img.scale,
    }));
    return `${JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 4)}\n`;
}

/**
 * Alpha for the themed (monochrome) layer. Android tints whatever is opaque, so the logo's
 * dark face has to become a hole or the themed icon is a blank blob. Dark pixels fade out,
 * light pixels keep the logo's own alpha; the ramp between keeps anti-aliased edges soft.
 */
function monochromeAlpha(r, g, b, a) {
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const keep = Math.min(1, Math.max(0, (luminance - 64) / 96));
    return Math.round(a * keep);
}

/**
 * The square to cut out of the master for the notification icon: centred on the logo's opaque
 * bounds and as wide as their longer side, so the logo keeps its proportions and fills the icon.
 * `bounds` is { left, top, right, bottom } in master pixels, right/bottom exclusive.
 */
function notificationCrop(bounds) {
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    if (width <= 0 || height <= 0) throw new Error('The logo master has no opaque pixels');
    const side = Math.max(width, height);
    return {
        x: Math.round(bounds.left + width / 2 - side / 2),
        y: Math.round(bounds.top + height / 2 - side / 2),
        side,
    };
}

/** Every file the generator writes, relative to the repo root. */
function outputPaths(icons = ICONS) {
    const files = [`${CONFIG.androidResDir}/${ACCENTS_XML}`];
    for (const density of Object.keys(ANDROID_DENSITIES)) {
        files.push(`${CONFIG.androidResDir}/mipmap-${density}/${SHARED_FOREGROUND}.webp`);
        files.push(`${CONFIG.androidResDir}/mipmap-${density}/${SHARED_MONOCHROME}.webp`);
        files.push(`${CONFIG.androidResDir}/drawable-${density}/${NOTIFICATION_ICON}.png`);
    }
    for (const icon of icons) {
        const set = `${CONFIG.iosAssetsDir}/${icon.id}.appiconset`;
        files.push(`${set}/Contents.json`);
        for (const px of new Set(IOS_IMAGES.map(img => img.px))) files.push(`${set}/${px}.png`);
        files.push(`${CONFIG.androidResDir}/drawable/ic_launcher_${icon.key}_background.xml`);
        files.push(`${CONFIG.androidResDir}/mipmap-anydpi-v26/ic_launcher_${icon.key}.xml`);
        files.push(`${CONFIG.androidResDir}/mipmap-anydpi-v26/ic_launcher_${icon.key}_round.xml`);
        for (const density of Object.keys(ANDROID_DENSITIES)) {
            files.push(`${CONFIG.androidResDir}/mipmap-${density}/ic_launcher_${icon.key}.webp`);
            files.push(`${CONFIG.androidResDir}/mipmap-${density}/ic_launcher_${icon.key}_round.webp`);
        }
        files.push(`${CONFIG.webPreviewDir}/${icon.id}.png`);
    }
    return files;
}

// ---- Raster output (needs @napi-rs/canvas; the pure helpers above do not) ----

function paintBackground(ctx, background, size) {
    if (background.type === 'solid') {
        ctx.fillStyle = background.color;
        ctx.fillRect(0, 0, size, size);
        return;
    }
    let gradient;
    if (background.type === 'linear') {
        const [x0, y0] = background.from;
        const [x1, y1] = background.to;
        gradient = ctx.createLinearGradient(x0 * size, y0 * size, x1 * size, y1 * size);
    } else {
        const [cx, cy] = background.center;
        gradient = ctx.createRadialGradient(cx * size, cy * size, 0, cx * size, cy * size, background.radius * size);
    }
    for (const s of stopOffsets(background.stops)) gradient.addColorStop(s.offset, s.color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
}

/** The full square icon: background plus the logo over the whole face, like the iOS sets. */
function renderIcon(canvasLib, master, background, size) {
    const canvas = canvasLib.createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    paintBackground(ctx, background, size);
    ctx.drawImage(master, 0, 0, size, size);
    return canvas;
}

/**
 * The sizes to pass through when shrinking `from` to `to`, halving each time and ending at `to`.
 * A canvas draw samples only a few source pixels per output pixel, so one jump from 1024 to 29
 * drops most of the logo's face and the eyes run into the mouth; halving keeps every step a 2:1
 * average.
 */
function halvingSteps(from, to) {
    const steps = [];
    let size = from;
    while (size / 2 > to) {
        size = Math.round(size / 2);
        steps.push(size);
    }
    steps.push(to);
    return steps;
}

function downscale(canvasLib, image, px) {
    let current = image;
    for (const size of halvingSteps(image.width, px)) {
        const next = canvasLib.createCanvas(size, size);
        const ctx = next.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(current, 0, 0, size, size);
        current = next;
    }
    return current;
}

function renderClipped(canvasLib, icon, size, shape) {
    const canvas = canvasLib.createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    if (shape === 'circle') {
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    } else {
        ctx.roundRect(0, 0, size, size, size * 0.2);
    }
    ctx.clip();
    ctx.drawImage(downscale(canvasLib, icon, size), 0, 0);
    return canvas;
}

function toMonochrome(ctx, size) {
    const data = ctx.getImageData(0, 0, size, size);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
        p[i + 3] = monochromeAlpha(p[i], p[i + 1], p[i + 2], p[i + 3]);
        p[i] = p[i + 1] = p[i + 2] = 255;
    }
    ctx.putImageData(data, 0, 0);
}

function renderAdaptiveForeground(canvasLib, master, px, monochrome) {
    const canvas = canvasLib.createCanvas(px, px);
    const ctx = canvas.getContext('2d');
    const inset = Math.round((px * ADAPTIVE_INSET_DP) / ADAPTIVE_CANVAS_DP);
    const visible = Math.round((px * ADAPTIVE_VISIBLE_DP) / ADAPTIVE_CANVAS_DP);
    ctx.drawImage(downscale(canvasLib, master, visible), inset, inset);
    if (monochrome) toMonochrome(ctx, px);
    return canvas;
}

/** The master's monochrome silhouette cropped square around the logo, at master resolution. */
function renderNotificationMaster(canvasLib, master) {
    const size = master.width;
    const full = canvasLib.createCanvas(size, size);
    const fullCtx = full.getContext('2d');
    fullCtx.drawImage(master, 0, 0);
    toMonochrome(fullCtx, size);

    const alpha = fullCtx.getImageData(0, 0, size, size).data;
    const bounds = { left: size, top: size, right: 0, bottom: 0 };
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (alpha[(y * size + x) * 4 + 3] === 0) continue;
            bounds.left = Math.min(bounds.left, x);
            bounds.top = Math.min(bounds.top, y);
            bounds.right = Math.max(bounds.right, x + 1);
            bounds.bottom = Math.max(bounds.bottom, y + 1);
        }
    }
    const crop = notificationCrop(bounds);
    const square = canvasLib.createCanvas(crop.side, crop.side);
    square.getContext('2d').drawImage(full, crop.x, crop.y, crop.side, crop.side, 0, 0, crop.side, crop.side);
    return square;
}

function renderNotificationIcon(canvasLib, silhouette, scale) {
    const px = Math.round(NOTIFICATION_ICON_DP * scale);
    // The same whole number of pixels on every side, so the logo stays centred where the padding
    // works out odd (hdpi: 36 px icon, 33 px live area).
    const inset = Math.max(1, Math.round((px - NOTIFICATION_LIVE_DP * scale) / 2));
    const live = px - 2 * inset;
    const canvas = canvasLib.createCanvas(px, px);
    canvas.getContext('2d').drawImage(downscale(canvasLib, silhouette, live), inset, inset);
    return canvas;
}

function write(relativePath, content) {
    const target = path.join(ROOT, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
}

async function run() {
    const canvasLib = require('@napi-rs/canvas');
    const master = await canvasLib.loadImage(path.join(ROOT, CONFIG.masterPath));
    if (master.width !== 1024 || master.height !== 1024) {
        throw new Error(`${CONFIG.masterPath} must be 1024x1024, got ${master.width}x${master.height}`);
    }

    for (const [density, scale] of Object.entries(ANDROID_DENSITIES)) {
        const px = Math.round(ADAPTIVE_CANVAS_DP * scale);
        const dir = `${CONFIG.androidResDir}/mipmap-${density}`;
        write(
            `${dir}/${SHARED_FOREGROUND}.webp`,
            renderAdaptiveForeground(canvasLib, master, px, false).toBuffer('image/webp', 100)
        );
        write(
            `${dir}/${SHARED_MONOCHROME}.webp`,
            renderAdaptiveForeground(canvasLib, master, px, true).toBuffer('image/webp', 100)
        );
    }

    write(`${CONFIG.androidResDir}/${ACCENTS_XML}`, accentsXml());

    const silhouette = renderNotificationMaster(canvasLib, master);
    for (const [density, scale] of Object.entries(ANDROID_DENSITIES)) {
        write(
            `${CONFIG.androidResDir}/drawable-${density}/${NOTIFICATION_ICON}.png`,
            renderNotificationIcon(canvasLib, silhouette, scale).toBuffer('image/png')
        );
    }

    for (const icon of ICONS) {
        const full = renderIcon(canvasLib, master, icon.background, 1024);
        const scaled = px => (px === full.width ? full : downscale(canvasLib, full, px));

        const set = `${CONFIG.iosAssetsDir}/${icon.id}.appiconset`;
        write(`${set}/Contents.json`, iosContentsJson());
        for (const px of new Set(IOS_IMAGES.map(img => img.px))) {
            write(`${set}/${px}.png`, scaled(px).toBuffer('image/png'));
        }

        write(
            `${CONFIG.androidResDir}/drawable/ic_launcher_${icon.key}_background.xml`,
            androidBackgroundXml(icon.background)
        );
        write(`${CONFIG.androidResDir}/mipmap-anydpi-v26/ic_launcher_${icon.key}.xml`, adaptiveIconXml(icon.key));
        write(`${CONFIG.androidResDir}/mipmap-anydpi-v26/ic_launcher_${icon.key}_round.xml`, adaptiveIconXml(icon.key));
        for (const [density, scale] of Object.entries(ANDROID_DENSITIES)) {
            const px = Math.round(LEGACY_ICON_DP * scale);
            const dir = `${CONFIG.androidResDir}/mipmap-${density}`;
            write(
                `${dir}/ic_launcher_${icon.key}.webp`,
                renderClipped(canvasLib, full, px, 'rounded').toBuffer('image/webp', 100)
            );
            write(
                `${dir}/ic_launcher_${icon.key}_round.webp`,
                renderClipped(canvasLib, full, px, 'circle').toBuffer('image/webp', 100)
            );
        }

        write(`${CONFIG.webPreviewDir}/${icon.id}.png`, scaled(CONFIG.webPreviewSize).toBuffer('image/png'));
    }

    console.log(`Wrote ${outputPaths().length} files for ${ICONS.map(i => i.id).join(', ')}.`);
}

if (require.main === module) {
    run().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    ICONS,
    CONFIG,
    toAdaptiveDp,
    androidColor,
    androidBackgroundXml,
    adaptiveIconXml,
    accentsXml,
    iosContentsJson,
    monochromeAlpha,
    notificationCrop,
    outputPaths,
    halvingSteps,
};
