import { describe, expect, it } from 'vitest';

import { firstVisibleChatNo } from './firstVisibleChatNo';

/** A feed of 40px rows starting at y=0, scrolled so the view's top edge sits at `viewTop`. */
const feed = (chatNos: (number | undefined)[], viewTop: number): HTMLElement => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ top: viewTop }) as DOMRect;
    chatNos.forEach((chatNo, index) => {
        const row = document.createElement('div');
        if (chatNo !== undefined) row.dataset.chatNo = String(chatNo);
        row.getBoundingClientRect = () => ({ bottom: (index + 1) * 40 }) as DOMRect;
        container.appendChild(row);
    });
    return container;
};

describe('firstVisibleChatNo', () => {
    it('returns the first row that reaches into the view', () => {
        expect(firstVisibleChatNo(feed([11, 12, 13, 14, 15], 90))).toBe(13);
    });

    it('counts a row cut by the top edge as in view', () => {
        expect(firstVisibleChatNo(feed([11, 12, 13], 39))).toBe(11);
    });

    it('returns null for an empty feed', () => {
        expect(firstVisibleChatNo(feed([], 0))).toBeNull();
    });

    it('returns null when every row is above the view', () => {
        expect(firstVisibleChatNo(feed([11, 12], 500))).toBeNull();
    });
});
