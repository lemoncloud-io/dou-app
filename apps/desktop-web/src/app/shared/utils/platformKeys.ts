export const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';
export const ALT_KEY = IS_MAC ? '⌥' : 'Alt';
