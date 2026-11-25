import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/runtime-react';

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

    it('never counts a reaction event as a reply', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            chat({ id: 'C1:3', chatNo: 3, parentId: '1', stereo: 'system', subType: 'reaction' }),
        ]);

        expect(index.get('1')?.count).toBe(1);
    });

    describe('new replies', () => {
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

        it('marks nothing while the read cursor is unknown, or without a rule', () => {
            const messages = [ROOT, chat({ id: 'C1:3', chatNo: 3, parentId: '1', ownerId: 'ada' })];

            expect(buildThreadIndex(messages, rule({ readNo: 0 })).get('1')?.newCount).toBe(0);
            expect(buildThreadIndex(messages).get('1')?.newCount).toBe(0);
        });
    });
});
