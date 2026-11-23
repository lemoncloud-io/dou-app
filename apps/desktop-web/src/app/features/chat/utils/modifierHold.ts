export type HeldModifier = 'mod' | 'alt';

export const MODIFIER_HOLD_MS = 300;

interface ModifierKeyEvent {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}

export const soleModifier = (event: ModifierKeyEvent, isMac: boolean): HeldModifier | null => {
    const { key, metaKey, ctrlKey, altKey, shiftKey } = event;
    if (shiftKey) return null;
    if (key === (isMac ? 'Meta' : 'Control')) return !altKey && !(isMac ? ctrlKey : metaKey) ? 'mod' : null;
    if (key === 'Alt') return !metaKey && !ctrlKey ? 'alt' : null;
    return null;
};
