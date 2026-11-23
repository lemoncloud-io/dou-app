import type { DomainChat } from '@chatic/runtime';

import { buildThread, buildThreadIndex, threadRootId, unseenReplies } from './buildThread';

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

    it('never counts a reaction event as a reply', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            chat({ id: 'C1:3', chatNo: 3, parentId: '1', stereo: 'system', subType: 'reaction' }),
        ]);

        expect(index.get('1')?.count).toBe(1);
    });

    it('collapses an optimistic full-id reply and a persisted chatNo reply into one entry', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            chat({ id: 'optimistic-1', chatNo: 0, parentId: 'C1:1', isPending: true }),
        ]);

        expect(index.size).toBe(1);
        expect(index.get('1')?.count).toBe(2);
    });

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

describe('buildThreadIndex — what the footer previews', () => {
    it("keeps the newest persisted reply for the preview, and each reply's mention record", () => {
        const mention$ = { userIds: ['me'] } as DomainChat['mention$'];
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1', content: 'first', mention$ }),
            chat({ id: 'C1:3', chatNo: 3, parentId: '1', content: 'newest', ownerId: 'bob' }),
        ]);

        const meta = index.get('1');
        expect(meta?.lastReply?.content).toBe('newest');
        expect(meta?.entries.map(entry => entry.mention$)).toEqual([mention$, undefined]);
    });
});

describe('unseenReplies', () => {
    it('lists the replies past the baseline that are not mine', () => {
        const meta = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1', ownerId: 'bob' }),
            chat({ id: 'C1:3', chatNo: 3, parentId: '1', ownerId: 'me' }),
            chat({ id: 'C1:4', chatNo: 4, parentId: '1', ownerId: 'bob' }),
        ]).get('1');
        if (!meta) throw new Error('no thread');

        expect(unseenReplies(meta, 2, 'me').map(entry => entry.chatNo)).toEqual([4]);
        expect(unseenReplies(meta, 4, 'me')).toEqual([]);
    });
});

describe('buildThread', () => {
    it('lists no event rows among the replies', () => {
        const { replies } = buildThread(
            [
                ROOT,
                chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
                chat({ id: 'C1:3', chatNo: 3, parentId: '1', stereo: 'system', subType: 'reaction' }),
                chat({ id: 'C1:4', chatNo: 4, parentId: '1', stereo: 'system', subType: 'edit' }),
            ],
            '1'
        );

        expect(replies.map(reply => reply.id)).toEqual(['C1:2']);
    });

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
