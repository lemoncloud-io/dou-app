/** Which family of shortcuts a held modifier starts: Mod (⌘ / Ctrl) or Alt (⌥ / Alt). */
export type HeldModifier = 'mod' | 'alt';

/** How long a modifier must stay down on its own before its hints show. */
export const MODIFIER_HOLD_MS = 300;

interface ModifierKeyEvent {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}

/**
 * The modifier a keydown presses on its own, or null for any other key or a modifier pressed with
 * another one held.
 *
 * Mod is ⌘ on macOS and Ctrl elsewhere, the same key the app's chords use there. The other one is
 * left alone: Ctrl on macOS starts no chord of ours, and the Windows key belongs to the OS, which
 * opens the Start menu over the app the moment it is released.
 *
 * A modifier's own keydown already reports its own flag (`metaKey` is true on the Meta keydown), so
 * only the other flags have to be clear.
 */
export const soleModifier = (event: ModifierKeyEvent, isMac: boolean): HeldModifier | null => {
    const { key, metaKey, ctrlKey, altKey, shiftKey } = event;
    if (shiftKey) return null;
    if (key === (isMac ? 'Meta' : 'Control')) return !altKey && !(isMac ? ctrlKey : metaKey) ? 'mod' : null;
    if (key === 'Alt') return !metaKey && !ctrlKey ? 'alt' : null;
    return null;
};
