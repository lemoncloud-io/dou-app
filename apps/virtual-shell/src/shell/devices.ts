import type { ShellPlatform } from '@chatic/fake-shell';

export interface Insets {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface DevicePreset {
    id: string;
    label: string;
    platform: ShellPlatform;
    /** The full-screen WebView in CSS pixels — what the page lays out in, status bar included. */
    width: number;
    height: number;
    insets: Insets;
    /** What the app reports as the device model; only ever read back as a label. */
    model: string;
    osVersion: string;
    /**
     * Where the size comes from. `fixed`: settled when the shell was built; `measured-width`: the width
     * was measured in the app's WebView on the device, the height is not; `approximate`: not measured —
     * correct it from a device when someone measures one.
     */
    source: 'fixed' | 'measured-width' | 'approximate';
}

const ANDROID_INSETS = { top: 24, bottom: 0, left: 0, right: 0 };

/**
 * The phones the shell can be. Sizes are the whole screen the WebView covers, not a browser's
 * viewport (which loses its toolbars). The safe areas are the e2e shell's: a notched iPhone and a
 * gesture-navigation Android phone; the home-button iPhone has none at the bottom. A foldable's two
 * states are two presets: the web is told nothing when a phone folds (the app sends no such event),
 * so folding is a relaunch, like any device change. Surface Duo is one screen — spanning both is not
 * something the web supports.
 */
export const DEVICE_PRESETS: readonly DevicePreset[] = [
    {
        id: 'iphone-large',
        label: 'iPhone (notch)',
        platform: 'ios',
        width: 393,
        height: 852,
        insets: { top: 59, bottom: 34, left: 0, right: 0 },
        model: 'iPhone17,1',
        osVersion: '26.0',
        source: 'fixed',
    },
    {
        id: 'iphone-small',
        label: 'iPhone (home button)',
        platform: 'ios',
        width: 375,
        height: 667,
        insets: { top: 20, bottom: 0, left: 0, right: 0 },
        model: 'iPhone14,6',
        osVersion: '26.0',
        source: 'fixed',
    },
    {
        id: 'android',
        label: 'Android',
        platform: 'android',
        width: 412,
        height: 915,
        insets: ANDROID_INSETS,
        model: 'Pixel 7',
        osVersion: '15',
        source: 'fixed',
    },
    {
        id: 'pixel-fold-unfolded',
        label: 'Pixel Fold (unfolded)',
        platform: 'android',
        width: 841,
        height: 701,
        insets: ANDROID_INSETS,
        model: 'Pixel Fold',
        osVersion: '15',
        source: 'measured-width',
    },
    {
        id: 'galaxy-fold-folded',
        label: 'Galaxy Z Fold (folded)',
        platform: 'android',
        width: 344,
        height: 882,
        insets: ANDROID_INSETS,
        model: 'SM-F956N',
        osVersion: '15',
        source: 'approximate',
    },
    {
        id: 'galaxy-fold-unfolded',
        label: 'Galaxy Z Fold (unfolded)',
        platform: 'android',
        width: 673,
        height: 841,
        insets: ANDROID_INSETS,
        model: 'SM-F956N',
        osVersion: '15',
        source: 'approximate',
    },
    {
        id: 'galaxy-flip',
        label: 'Galaxy Z Flip',
        platform: 'android',
        width: 412,
        height: 1004,
        insets: ANDROID_INSETS,
        model: 'SM-F741N',
        osVersion: '15',
        source: 'approximate',
    },
    {
        id: 'surface-duo',
        label: 'Surface Duo (one screen)',
        platform: 'android',
        width: 540,
        height: 720,
        insets: ANDROID_INSETS,
        model: 'Surface Duo',
        osVersion: '12',
        source: 'approximate',
    },
    {
        id: 'ipad-mini',
        label: 'iPad mini',
        platform: 'ios',
        width: 744,
        height: 1133,
        insets: { top: 24, bottom: 20, left: 0, right: 0 },
        model: 'iPad14,1',
        osVersion: '26.0',
        source: 'approximate',
    },
];

/** The keyboard's height when nobody says otherwise: roughly what each platform's keyboard takes. */
export const DEFAULT_KEYBOARD_HEIGHT: Record<ShellPlatform, number> = { ios: 336, android: 300 };

export const DEFAULT_DEVICE_ID = 'iphone-large';

export const findDevice = (id: string): DevicePreset | undefined => DEVICE_PRESETS.find(device => device.id === id);
