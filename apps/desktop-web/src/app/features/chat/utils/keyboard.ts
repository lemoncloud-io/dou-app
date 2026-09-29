/**
 * Alt+Shift+↑/↓ moves the focused sidebar row within its own section. The chord lives here so
 * the handler and the ShortcutsDialog cheat sheet cannot disagree. Returns the move direction,
 * or null when the event is not the move chord (plain arrows keep navigating).
 */
export const sidebarMoveChord = (event: { altKey: boolean; shiftKey: boolean; key: string }): 1 | -1 | null => {
    if (!event.altKey || !event.shiftKey) return null;
    if (event.key === 'ArrowDown') return 1;
    if (event.key === 'ArrowUp') return -1;
    return null;
};

/** Whether a key event lands in something the user is typing into. */
export const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

/**
 * A focused control answers keys itself (Space presses a button, letters jump
 * within a listbox), so a key typed on one is not the start of a message.
 */
const INTERACTIVE_TARGET =
    'button, a[href], summary, [role="button"], [role="option"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="treeitem"], [role="link"]';

/**
 * Keys that already mean something app-wide when nothing is focused, so typing them must
 * not be taken as "start a message": `?` opens the shortcut sheet (ShortcutsDialog).
 */
const RESERVED_KEYS = new Set(['?']);

/**
 * Slack's type-to-compose: a printable key pressed while nothing takes text input should
 * start a message. False for modified keys (shortcuts), non-character keys, reserved keys,
 * anything aimed at a text field or a focused control, and while a dialog or menu is open over the page.
 */
export const shouldCaptureTyping = (event: KeyboardEvent): boolean => {
    if (event.defaultPrevented || event.isComposing) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key.length !== 1 || RESERVED_KEYS.has(event.key)) return false;
    if (isTypingTarget(event.target)) return false;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_TARGET)) return false;
    // Scoped to open ones: Radix can keep a closed dialog mounted while it animates out.
    return !document.querySelector(
        ':is([role="dialog"], [role="alertdialog"], [role="menu"]):not([data-state="closed"])'
    );
};

/**
 * The channel Alt+Shift+↓/↑ lands on from outside the sidebar: the next (or previous)
 * one with unread, in the order the sidebar draws them, wrapping around. Null when
 * nothing else is unread. (Inside the sidebar the same chord reorders the focused row.)
 */
export const nextUnreadChannelId = (
    ordered: readonly { id?: string; unreadCount?: number }[],
    currentId: string | null,
    direction: 1 | -1
): string | null => {
    const count = ordered.length;
    if (count === 0) return null;
    // Not found: start just before the first row (going down) or at it (going up).
    const found = ordered.findIndex(channel => channel.id === currentId);
    const from = found >= 0 ? found : direction === 1 ? -1 : 0;
    for (let step = 1; step <= count; step += 1) {
        const channel = ordered[(((from + direction * step) % count) + count) % count];
        if (channel.id && channel.id !== currentId && (channel.unreadCount ?? 0) > 0) return channel.id;
    }
    return null;
};
