import type { HistoryDirection } from '../stores/useHistoryRequestStore';

/**
 * Mod+[ is Back and Mod+] is Forward, as in a browser and in most desktop apps. Read from `code`
 * first so a layout whose bracket keys report other characters still has the chords; Shift and
 * Alt are left to whatever else binds them. Null for any other key.
 */
export const historyChord = (event: {
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    key: string;
    code?: string;
}): HistoryDirection | null => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null;
    if (event.code === 'BracketLeft' || event.key === '[') return 'back';
    if (event.code === 'BracketRight' || event.key === ']') return 'forward';
    return null;
};

/**
 * The mouse's side buttons: 3 is back and 4 is forward. Chromium delivers them to the page on
 * every desktop OS, and the shell does nothing with them, so the page is where they are answered.
 */
export const historyMouseButton = (button: number): HistoryDirection | null =>
    button === 3 ? 'back' : button === 4 ? 'forward' : null;
