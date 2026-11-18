/**
 * Mod+[ is Back, as in a browser and in most desktop apps. Read from `code` first so a layout
 * whose bracket key reports a different character still has the chord; Shift and Alt are left
 * to whatever else binds them.
 */
export const isBackChord = (event: {
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    key: string;
    code?: string;
}): boolean =>
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.code === 'BracketLeft' || event.key === '[');

/**
 * The side "back" button a mouse reports. Chromium delivers it to the page on every desktop OS,
 * and the shell does nothing with it, so the page is where it has to be answered.
 */
export const BACK_MOUSE_BUTTON = 3;
