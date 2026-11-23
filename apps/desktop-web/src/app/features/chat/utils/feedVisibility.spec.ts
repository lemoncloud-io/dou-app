import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/runtime';

import { isFeedVisible } from './feedVisibility';

const chat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'C1:1', channelId: 'C1', chatNo: 1, content: 'hi', ...over }) as DomainChat;

describe('isFeedVisible', () => {
    it('keeps an ordinary top-level message', () => {
        expect(isFeedVisible(chat())).toBe(true);
    });

    it('drops a thread reply — those belong to the thread panel', () => {
        expect(isFeedVisible(chat({ parentId: 'C1:1' }))).toBe(false);
    });

    it('keeps a deleted message so the feed can say one was here', () => {
        expect(isFeedVisible(chat({ hidden: true }))).toBe(true);
    });

    it('keeps the wire form of hidden (BoolFlag 1) the same way', () => {
        expect(isFeedVisible(chat({ hidden: 1 } as unknown as Partial<DomainChat>))).toBe(true);
    });

    it('keeps a join/leave system row — it renders as a notice, not a message', () => {
        expect(isFeedVisible(chat({ stereo: 'system', subType: 'join' }))).toBe(true);
    });

    it('drops a reaction event', () => {
        expect(isFeedVisible(chat({ stereo: 'system', subType: 'reaction' }))).toBe(false);
    });

    it('drops a deleted reaction event rather than tombstoning it', () => {
        expect(isFeedVisible(chat({ stereo: 'system', subType: 'reaction', hidden: true }))).toBe(false);
    });

    it('drops a revision notice, an edit or a delete alike', () => {
        expect(isFeedVisible(chat({ stereo: 'system', subType: 'edit', content: '' }))).toBe(false);
        expect(
            isFeedVisible(
                chat({
                    stereo: 'system',
                    subType: 'edit',
                    edit$: { action: 'delete', chatId: 'C1:1' },
                } as Partial<DomainChat>)
            )
        ).toBe(false);
    });
});
