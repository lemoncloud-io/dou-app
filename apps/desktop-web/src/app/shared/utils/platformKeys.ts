const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

/** The modifier label a shortcut hint shows on this OS: `⌘` on macOS, `Ctrl` elsewhere. */
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';
export const ALT_KEY = isMac ? '⌥' : 'Alt';
