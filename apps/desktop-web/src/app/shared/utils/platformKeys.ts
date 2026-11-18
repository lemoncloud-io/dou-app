/** macOS, where the app's chords use ⌘; everywhere else they use Ctrl. */
export const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

/** The modifier label a shortcut hint shows on this OS: `⌘` on macOS, `Ctrl` elsewhere. */
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';
export const ALT_KEY = IS_MAC ? '⌥' : 'Alt';
