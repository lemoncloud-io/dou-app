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

    // The panel filters deleted replies out, so counting them would print a footer
    // promising more than the thread contains.
    it('leaves a deleted reply out of the count', () => {
        const index = buildThreadIndex([
            ROOT,
            chat({ id: 'C1:2', chatNo: 2, parentId: '1' }),
            chat({ id: 'C1:3', chatNo: 3, parentId: '1', hidden: true }),
        ]);

        expect(index.get('1')?.count).toBe(1);
    });

    it('drops the root entirely once its only reply is deleted', () => {
        const index = buildThreadIndex([ROOT, chat({ id: 'C1:2', chatNo: 2, parentId: '1', hidden: true })]);

        expect(index.has('1')).toBe(false);
    });
});
