import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { buildThreadIndex } from './buildThread';

const chat = (over: Partial<DomainChat>): DomainChat => ({ channelId: 'C1', createdAt: 1, ...over }) as DomainChat;

const ROOT = chat({ id: 'C1:1', chatNo: 1, content: 'question' });

describe('buildThreadIndex', () => {
    it('counts the replies loaded under a root', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            chat({ id: 'C1:3', chatNo: 3, parentId: '1' }),
        ]);

        expect(index.get('1')?.count).toBe(2);
    });

    // A deleted reply still occupies a row in the panel, as a tombstone. The footer
    // counts rows, so it counts that one — the alternative is "1 reply" over a thread
    // showing two.
    it('counts a deleted reply, because the panel still shows it', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            chat({ id: 'C1:3', chatNo: 3, parentId: '1', hidden: true }),
        ]);

        expect(index.get('1')?.count).toBe(2);
    });

    it('keeps the root listed when its only reply is deleted', () => {
        const index = buildThreadIndex([ROOT, chat({ id: 'C1:2', chatNo: 2, parentId: '1', hidden: true })]);

        expect(index.get('1')?.count).toBe(1);
    });

    // Reaction events arrive as replies to the message they are on. Counting them
    // would turn every reacted-to message into a thread.
    it('never counts a reaction event as a reply', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            chat({ id: 'C1:3', chatNo: 3, parentId: '1', stereo: 'system', subType: 'reaction' }),
        ]);

        expect(index.get('1')?.count).toBe(1);
    });
});
