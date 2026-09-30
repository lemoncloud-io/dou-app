/** The open room's message box — the thread panel's reply box is not inside `main`. */
const ROOM_COMPOSER = 'main [data-composer-input]';

export const focusComposer = () => document.querySelector<HTMLElement>(ROOM_COMPOSER)?.focus({ preventScroll: true });

/**
 * For a dialog's `onCloseAutoFocus`: when closing left focus on nothing, put it in the room's
 * message box. The ui-kit dialog returns focus to its opener after this handler runs, so the check
 * waits a microtask and only fills in where that return found no opener — a dialog opened from
 * state, or one whose opener left the page while it was open.
 */
export const focusComposerIfDropped = () => {
    queueMicrotask(() => {
        const active = document.activeElement;
        if (!active || active === document.body) focusComposer();
    });
};
