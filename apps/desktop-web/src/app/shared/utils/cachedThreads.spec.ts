import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import '../../../i18n';

import { cachedThreads } from './cachedThreads';

const ME = 'me';
const chat = (chatNo: number, over: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        ownerId: 'bob',
        content: `m${chatNo}`,
        createdAt: chatNo * 10,
        ...over,
    }) as DomainChat;
const isMine = (row: DomainChat) => row.ownerId === ME;
const scope = { cid: 'cloud-a', channelId: 'C1', placeId: 'P1' };

describe('cachedThreads', () => {
    it('finds a thread I replied in, with its root and its newest reply', () => {
        const rows = [
            chat(1, { owner$: { name: 'Bob' } } as Partial<DomainChat>),
            chat(2, { parentId: '1', ownerId: ME }),
            chat(3, { parentId: '1', content: 'last' }),
        ];

        expect(cachedThreads(rows, isMine, scope)).toEqual([
            {
                reply: {
                    cid: 'cloud-a',
                    channelId: 'C1',
                    placeId: 'P1',
                    rootNo: '1',
                    replyNo: 3,
                    preview: 'last',
                    ownerName: '',
                    at: 30,
                    mine: false,
                },
                root: { preview: 'm1', ownerName: 'Bob' },
            },
        ]);
    });

    it('finds a thread under a root of mine that someone else replied to', () => {
        const rows = [chat(1, { ownerId: ME }), chat(2, { parentId: '1' })];

        expect(cachedThreads(rows, isMine, scope).map(t => t.reply.rootNo)).toEqual(['1']);
    });

    it("leaves out other people's threads, reactions, and replies whose root is not cached", () => {
        const rows = [
            chat(1),
            chat(2, { parentId: '1' }),
            chat(3, { parentId: '1', ownerId: ME, subType: 'reaction' } as Partial<DomainChat>),
            chat(5, { parentId: '4', ownerId: ME }),
        ];

        expect(cachedThreads(rows, isMine, scope)).toEqual([]);
    });

    it('reads a reply that names its root by full id', () => {
        const rows = [chat(1, { ownerId: ME }), chat(2, { parentId: 'C1:1' })];

        expect(cachedThreads(rows, isMine, scope).map(t => t.reply.rootNo)).toEqual(['1']);
    });
});
