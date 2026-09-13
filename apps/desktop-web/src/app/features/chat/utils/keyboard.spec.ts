import { afterEach, describe, expect, it } from 'vitest';

import { shouldCaptureTyping, sidebarMoveChord } from './keyboard';

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

    it('stays out of the way while a dialog is open', () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        document.body.appendChild(dialog);
        expect(shouldCaptureTyping(press('h'))).toBe(false);
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
