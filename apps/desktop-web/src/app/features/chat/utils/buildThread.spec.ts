import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { buildThreadIndex, type NewReplyRule } from './buildThread';

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

    describe('new replies', () => {
        // The channel opened with the cursor at 2: replies above it are news, unless they are mine.
        const rule = (over: Partial<NewReplyRule> = {}): NewReplyRule => ({
            readNo: 2,
            isMine: reply => reply.ownerId === 'me',
            ...over,
        });

        it("counts other people's replies above the read cursor", () => {
            const index = buildThreadIndex(
                [
                    ROOT,
                    chat({ id: 'C1:2', chatNo: 2, parentId: '1', ownerId: 'ada' }),
                    chat({ id: 'C1:3', chatNo: 3, parentId: '1', ownerId: 'ada' }),
                    chat({ id: 'C1:4', chatNo: 4, parentId: '1', ownerId: 'bo' }),
                ],
                rule()
            );

            expect(index.get('1')).toMatchObject({ count: 3, newCount: 2 });
        });

        it('leaves out my own reply and a deleted one', () => {
            const index = buildThreadIndex(
                [
                    ROOT,
                    chat({ id: 'C1:3', chatNo: 3, parentId: '1', ownerId: 'me' }),
                    chat({ id: 'C1:4', chatNo: 4, parentId: '1', ownerId: 'ada', hidden: true }),
                ],
                rule()
            );

            expect(index.get('1')?.newCount).toBe(0);
        });

        // An unsent reply has no number yet and is always mine; it must not read as news either way.
        it('leaves out a reply the server has not numbered', () => {
            const index = buildThreadIndex([ROOT, chat({ tempId: 't1', parentId: 'C1:1', ownerId: 'ada' })], rule());

            expect(index.get('1')).toMatchObject({ count: 1, newCount: 0 });
        });

        it('stops counting what the thread panel has already shown', () => {
            const messages = [
                ROOT,
                chat({ id: 'C1:3', chatNo: 3, parentId: '1', ownerId: 'ada' }),
                chat({ id: 'C1:5', chatNo: 5, parentId: '1', ownerId: 'ada' }),
            ];

            expect(buildThreadIndex(messages, rule({ seenByRoot: new Map([['1', 4]]) })).get('1')?.newCount).toBe(1);
            expect(buildThreadIndex(messages, rule({ seenByRoot: new Map([['1', 5]]) })).get('1')?.newCount).toBe(0);
        });

        // With no read cursor every reply would be "new" — the same flash the unread divider refuses.
        it('marks nothing while the read cursor is unknown, or without a rule', () => {
            const messages = [ROOT, chat({ id: 'C1:3', chatNo: 3, parentId: '1', ownerId: 'ada' })];

            expect(buildThreadIndex(messages, rule({ readNo: 0 })).get('1')?.newCount).toBe(0);
            expect(buildThreadIndex(messages).get('1')?.newCount).toBe(0);
        });
    });
});
