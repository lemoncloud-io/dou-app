/** The slice of Electron's BrowserWindow that bringing a window forward needs. */
export interface FrontableWindow {
    isMinimized(): boolean;
    restore(): void;
    show(): void;
    focus(): void;
}

/**
 * Bring the window in front of the user from any state it can be in: minimized, hidden
 * to the tray, or merely behind other windows.
 *
 * `isVisible()` is true for a minimized window, so a `isVisible() ? focus() : show()`
 * shortcut only focuses it and leaves it in the taskbar (seen on Windows). Restoring
 * first is what actually un-minimizes it; `show()` then covers the hidden-to-tray case
 * and `focus()` takes the keyboard.
 */
export const bringToFront = (win: FrontableWindow): void => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
};
