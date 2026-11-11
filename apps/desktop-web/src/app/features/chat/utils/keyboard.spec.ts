import { afterEach, describe, expect, it } from 'vitest';

import { digitOfKey, isOverlayOpen, nextUnreadChannelId, shouldCaptureTyping, sidebarMoveChord } from './keyboard';

const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    Object.defineProperty(event, 'target', { value: target });
    return event;
};

describe('shouldCaptureTyping', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('takes a printable key typed on the page', () => {
        expect(shouldCaptureTyping(press('h'))).toBe(true);
    });

    // Shortcuts, navigation and the shortcut sheet's own key keep their meaning.
    it('leaves modified keys, non-character keys and "?" alone', () => {
        expect(shouldCaptureTyping(press('k', { metaKey: true }))).toBe(false);
        expect(shouldCaptureTyping(press('ArrowDown'))).toBe(false);
        expect(shouldCaptureTyping(press('?'))).toBe(false);
    });

    it('never steals a key aimed at another text field', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        expect(shouldCaptureTyping(press('h', {}, input))).toBe(false);
    });

    // A letter typed on a focused channel row used to pull focus into the composer.
    it('leaves keys aimed at a focused control alone', () => {
        const button = document.createElement('button');
        const option = document.createElement('div');
        option.setAttribute('role', 'option');
        document.body.append(button, option);
        expect(shouldCaptureTyping(press(' ', {}, button))).toBe(false);
        expect(shouldCaptureTyping(press('h', {}, option))).toBe(false);
    });

    it('stays out of the way while a dialog is open', () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('data-state', 'open');
        document.body.appendChild(dialog);
        expect(shouldCaptureTyping(press('h'))).toBe(false);
    });

    // Shift+1 is the rail's place key; taking it as text would be the first character of a message.
    it('leaves Shift+digit to the rail chords', () => {
        expect(shouldCaptureTyping(press('!', { code: 'Digit1', shiftKey: true }))).toBe(false);
        expect(shouldCaptureTyping(press('@', { code: 'Digit2', shiftKey: true }))).toBe(false);
    });
});

describe('isOverlayOpen', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('is true while a dialog or a menu is over the page', () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('data-state', 'open');
        const menu = document.createElement('div');
        menu.setAttribute('role', 'menu');
        menu.setAttribute('data-state', 'open');
        document.body.append(dialog, menu);
        expect(isOverlayOpen()).toBe(true);
    });

    it('ignores one that has been closed and is only animating out', () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('data-state', 'closed');
        document.body.appendChild(dialog);
        expect(isOverlayOpen()).toBe(false);
    });

    // The compact sidebar drawer is a `role="dialog"` that stays mounted while it is shut, so an
    // open-state check is the only thing that keeps it from swallowing every key on the page.
    it('does not count a dialog that carries no open state at all', () => {
        const drawer = document.createElement('div');
        drawer.setAttribute('role', 'dialog');
        document.body.appendChild(drawer);
        expect(isOverlayOpen()).toBe(false);
    });
});

describe('digitOfKey', () => {
    // With Shift held the row reports "!" as `key`, so the code is what names the digit.
    it('names the digit from the physical key, whatever Shift did to the character', () => {
        expect(digitOfKey(press('1', { code: 'Digit1' }))).toBe(1);
        expect(digitOfKey(press('!', { code: 'Digit1', shiftKey: true }))).toBe(1);
        expect(digitOfKey(press('0', { code: 'Digit0' }))).toBe(0);
    });

    it('falls back to the character when the event carries no code', () => {
        expect(digitOfKey(press('7'))).toBe(7);
    });

    it('is null for a key that is not a number-row digit', () => {
        expect(digitOfKey(press('k', { code: 'KeyK' }))).toBeNull();
        expect(digitOfKey(press('!'))).toBeNull();
        expect(digitOfKey(press('ArrowUp', { code: 'ArrowUp' }))).toBeNull();
    });
});

describe('sidebarMoveChord', () => {
    it('recognizes Alt+Shift+ArrowUp/Down as the move chord with its direction', () => {
        expect(sidebarMoveChord({ altKey: true, shiftKey: true, key: 'ArrowDown' })).toBe(1);
        expect(sidebarMoveChord({ altKey: true, shiftKey: true, key: 'ArrowUp' })).toBe(-1);
    });

    it('is null for every other modifier combination — plain arrows must navigate', () => {
        expect(sidebarMoveChord({ altKey: false, shiftKey: false, key: 'ArrowDown' })).toBeNull();
        expect(sidebarMoveChord({ altKey: false, shiftKey: true, key: 'ArrowUp' })).toBeNull();
        expect(sidebarMoveChord({ altKey: true, shiftKey: false, key: 'ArrowUp' })).toBeNull();
        expect(sidebarMoveChord({ altKey: true, shiftKey: true, key: 'Enter' })).toBeNull();
    });
});

describe('nextUnreadChannelId', () => {
    const list = [
        { id: 'a', unreadCount: 0 },
        { id: 'b', unreadCount: 2 },
        { id: 'c', unreadCount: 0 },
        { id: 'd', unreadCount: 1 },
    ];

    it('goes to the next unread in sidebar order, wrapping around', () => {
        expect(nextUnreadChannelId(list, 'b', 1)).toBe('d');
        expect(nextUnreadChannelId(list, 'd', 1)).toBe('b');
        expect(nextUnreadChannelId(list, 'c', -1)).toBe('b');
    });

    it('starts from the top when nothing is open', () => {
        expect(nextUnreadChannelId(list, null, 1)).toBe('b');
        expect(nextUnreadChannelId(list, null, -1)).toBe('d');
    });

    it('stays put when nothing else is unread', () => {
        expect(nextUnreadChannelId([{ id: 'a', unreadCount: 3 }], 'a', 1)).toBeNull();
    });
});
