export const sidebarMoveChord = (event: { altKey: boolean; shiftKey: boolean; key: string }): 1 | -1 | null => {
    if (!event.altKey || !event.shiftKey) return null;
    if (event.key === 'ArrowDown') return 1;
    if (event.key === 'ArrowUp') return -1;
    return null;
};

export const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

export const isOverlayOpen = (): boolean =>
    document.querySelector(':is([role="dialog"], [role="alertdialog"], [role="menu"])[data-state="open"]') !== null;

export const digitOfKey = (event: { code?: string; key: string }): number | null => {
    const fromCode = /^Digit([0-9])$/.exec(event.code ?? '');
    if (fromCode) return Number(fromCode[1]);
    return /^[0-9]$/.test(event.key) ? Number(event.key) : null;
};

const INTERACTIVE_TARGET =
    'button, a[href], summary, [role="button"], [role="option"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="treeitem"], [role="link"]';

const RESERVED_KEYS = new Set(['?']);

export const shouldCaptureTyping = (event: KeyboardEvent): boolean => {
    if (event.defaultPrevented || event.isComposing) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.shiftKey && digitOfKey(event) !== null) return false;
    if (event.key.length !== 1 || RESERVED_KEYS.has(event.key)) return false;
    if (isTypingTarget(event.target)) return false;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_TARGET)) return false;
    return !isOverlayOpen();
};

export const nextUnreadChannelId = (
    ordered: readonly { id?: string; unreadCount?: number }[],
    currentId: string | null,
    direction: 1 | -1
): string | null => {
    const count = ordered.length;
    if (count === 0) return null;
    const found = ordered.findIndex(channel => channel.id === currentId);
    const from = found >= 0 ? found : direction === 1 ? -1 : 0;
    for (let step = 1; step <= count; step += 1) {
        const channel = ordered[(((from + direction * step) % count) + count) % count];
        if (channel.id && channel.id !== currentId && (channel.unreadCount ?? 0) > 0) return channel.id;
    }
    return null;
};
