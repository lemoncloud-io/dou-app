/** Whether a key event lands in something the user is typing into. */
export const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

/**
 * Keys that already mean something app-wide when nothing is focused, so typing them must
 * not be taken as "start a message": `?` opens the shortcut sheet (ShortcutsDialog).
 */
const RESERVED_KEYS = new Set(['?']);

/**
 * Slack's type-to-compose: a printable key pressed while nothing takes text input should
 * start a message. False for modified keys (shortcuts), non-character keys, reserved keys,
 * anything aimed at a text field, and while a dialog or menu is open over the page.
 */
export const shouldCaptureTyping = (event: KeyboardEvent): boolean => {
    if (event.defaultPrevented || event.isComposing) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key.length !== 1 || RESERVED_KEYS.has(event.key)) return false;
    if (isTypingTarget(event.target)) return false;
    return !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]');
};
