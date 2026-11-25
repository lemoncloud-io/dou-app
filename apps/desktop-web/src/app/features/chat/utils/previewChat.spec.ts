import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/runtime-react';

import { isPreviewableChat, pickPreviewChat } from './previewChat';

const chat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'C1:1', channelId: 'C1', chatNo: 1, content: 'hi', createdAt: 1_000, ...over }) as DomainChat;

describe('isPreviewableChat', () => {
    it('takes an ordinary top-level message', () => {
        expect(isPreviewableChat(chat())).toBe(true);
    });

    it('takes a deleted message — the sidebar tombstones it like the feed does', () => {
        expect(isPreviewableChat(chat({ hidden: true }))).toBe(true);
    });

    it('skips a failed send', () => {
        expect(isPreviewableChat(chat({ chatNo: 0, isFailed: true }))).toBe(false);
    });

    it('skips a thread reply', () => {
        expect(isPreviewableChat(chat({ parentId: 'C1:1' }))).toBe(false);
    });

    it('skips a reaction event', () => {
        expect(isPreviewableChat(chat({ stereo: 'system', subType: 'reaction' }))).toBe(false);
    });

    it('skips a join/leave system row, which has no body to preview', () => {
        expect(isPreviewableChat(chat({ stereo: 'system', subType: 'join' }))).toBe(false);
    });
});

describe('pickPreviewChat', () => {
    it('picks the highest chatNo, whatever order the window arrives in', () => {
        const picked = pickPreviewChat([
            chat({ id: 'C1:3', chatNo: 3, content: 'newest' }),
            chat({ id: 'C1:1', chatNo: 1, content: 'oldest' }),
            chat({ id: 'C1:2', chatNo: 2, content: 'middle' }),
        ]);
        expect(picked?.content).toBe('newest');
    });

    it('prefers a pending send over every persisted row', () => {
        const picked = pickPreviewChat([
            chat({ id: 'C1:9', chatNo: 9, content: 'persisted' }),
            chat({ id: 'optimistic-1', chatNo: 0, isPending: true, content: 'just sent' }),
        ]);
        expect(picked?.content).toBe('just sent');
    });

    it('falls back to the last delivered message when a send failed', () => {
        const picked = pickPreviewChat([
            chat({ id: 'C1:9', chatNo: 9, content: 'delivered' }),
            chat({ id: 'optimistic-2', chatNo: 0, isFailed: true, content: 'never sent' }),
        ]);
        expect(picked?.content).toBe('delivered');
    });

    it('falls through to the last real message when newer rows are replies and reactions', () => {
        const picked = pickPreviewChat([
            chat({ id: 'C1:5', chatNo: 5, content: 'real' }),
            chat({ id: 'C1:6', chatNo: 6, parentId: 'C1:5', content: 'reply' }),
            chat({ id: 'C1:7', chatNo: 7, stereo: 'system', subType: 'reaction' }),
        ]);
        expect(picked?.content).toBe('real');
    });

    it('picks a deleted message when it is the latest', () => {
        const picked = pickPreviewChat([
            chat({ id: 'C1:1', chatNo: 1, content: 'earlier' }),
            chat({ id: 'C1:2', chatNo: 2, content: 'gone', hidden: true }),
        ]);
        expect(picked?.id).toBe('C1:2');
    });

    it('returns undefined when the window holds nothing previewable', () => {
        expect(pickPreviewChat([chat({ parentId: 'C1:1' })])).toBeUndefined();
        expect(pickPreviewChat([])).toBeUndefined();
    });
});
