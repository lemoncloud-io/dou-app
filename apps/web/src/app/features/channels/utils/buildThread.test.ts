import type { DomainChat } from '@chatic/data';

import { buildThread, buildThreadIndex, threadRootId } from './buildThread';

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

    // A deleted reply still occupies a row on the thread page, as a tombstone. The
    // footer counts rows, so it counts that one — the alternative is "1 reply" over a
    // thread showing two.
    it('counts a deleted reply, because the thread still shows it', () => {
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

    // An optimistic reply carries the parent's FULL id until the persisted swap; the
    // index normalises it onto the root's chatNo so the footer shows ONE thread, not two.
    it('collapses an optimistic full-id reply and a persisted chatNo reply into one entry', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            chat({ id: 'optimistic-1', chatNo: 0, parentId: 'C1:1', isPending: true }),
        ]);

        expect(index.size).toBe(1);
        expect(index.get('1')?.count).toBe(2);
    });

    // The unseen-reply dot compares the read cursor against the newest loaded reply's
    // chatNo; a pending reply (chatNo 0) must not drag it back down.
    it('tracks the highest loaded reply chatNo for the read-cursor comparison', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            chat({ id: 'C1:5', chatNo: 5, parentId: '1' }),
            chat({ id: 'optimistic-1', chatNo: 0, parentId: 'C1:1', isPending: true }),
        ]);

        expect(index.get('1')?.lastReplyNo).toBe(5);
    });

    it('remembers who wrote the newest persisted reply — my own reply must not dot my thread', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1', ownerId: 'ada' }),
            chat({ id: 'C1:5', chatNo: 5, parentId: '1', ownerId: 'bob' }),
        ]);

        expect(index.get('1')?.lastReplyOwnerId).toBe('bob');
    });

    it('collects unique repliers in first-seen order for the avatar stack', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1', ownerId: 'ada' }),
            chat({ id: 'C1:3', chatNo: 3, parentId: '1', ownerId: 'bob' }),
            chat({ id: 'C1:4', chatNo: 4, parentId: '1', ownerId: 'ada' }),
        ]);

        expect(index.get('1')?.repliers.map(r => r.id)).toEqual(['ada', 'bob']);
    });
});

describe('buildThread', () => {
    it('matches replies by either parentId encoding', () => {
        const { root, replies } = buildThread(
            [
                ROOT,
                chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
                chat({ id: 'optimistic-1', chatNo: 0, parentId: 'C1:1', isPending: true }),
            ],
            '1'
        );

        expect(root).toBe(ROOT);
        expect(replies).toHaveLength(2);
    });

    it('orders replies oldest→newest with pending ones last', () => {
        const { replies } = buildThread(
            [
                ROOT,
                chat({ id: 'optimistic-1', chatNo: 0, parentId: 'C1:1', isPending: true, createdAt: 9 }),
                chat({ id: 'C1:3', chatNo: 3, parentId: '1' }),
                chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            ],
            '1'
        );

        expect(replies.map(r => r.id)).toEqual(['C1:2', 'C1:3', 'optimistic-1']);
    });

    // ADR 0008: the root can be paged out of the local cache while its replies are
    // loaded. chatNo-encoded replies still match on the bare rootId.
    it('degrades to replies-only when the root is paged out', () => {
        const { root, replies } = buildThread([chat({ id: 'C1:2', chatNo: 2, parentId: '1' })], '1');

        expect(root).toBeUndefined();
        expect(replies).toHaveLength(1);
    });
});

describe('threadRootId', () => {
    it('answers the parentId for a reply and the own chatNo for a root', () => {
        expect(threadRootId(chat({ id: 'C1:2', chatNo: 2, parentId: '1' }))).toBe('1');
        expect(threadRootId(ROOT)).toBe('1');
    });
});
