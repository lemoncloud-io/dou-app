import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/runtime-react';

import type { MessageViewer } from './buildMessageRows';
import { foldReactions, hasMyReaction } from './foldReactions';

const ME = 'me';
const ME_CLOUD = 'me-cloud';
const VIEWER: MessageViewer = { uid: ME, name: 'Me', cloudUid: ME_CLOUD };

const reaction = (
    chatNo: number,
    userId: string,
    emoji: string,
    action: 'on' | 'off' = 'on',
    targetId = 'C1:1'
): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        ownerId: userId,
        stereo: 'system',
        subType: 'reaction',
        reaction$: { chatId: targetId, emoji, action },
    }) as DomainChat;

const message = (chatNo: number): DomainChat =>
    ({ id: `C1:${chatNo}`, channelId: 'C1', chatNo, content: 'hello' }) as DomainChat;

describe('foldReactions', () => {
    it('groups reactors under the emoji they used', () => {
        const tallies = foldReactions([message(1), reaction(2, 'ada', '👍'), reaction(3, 'bob', '👍')], VIEWER);

        expect(tallies.get('C1:1')).toEqual([{ emoji: '👍', key: '👍', userIds: ['ada', 'bob'], mine: false }]);
    });

    it('marks the tally the signed-in user is part of', () => {
        const tallies = foldReactions([reaction(2, ME, '🎉')], VIEWER);

        expect(tallies.get('C1:1')?.[0]).toMatchObject({ mine: true });
    });

    it('lets a later off remove the person again', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍'), reaction(3, 'ada', '👍', 'off')], VIEWER);

        expect(tallies.get('C1:1')).toBeUndefined();
    });

    it('keeps the newest event per person and emoji regardless of arrival order', () => {
        const outOfOrder = [reaction(5, 'ada', '👍'), reaction(3, 'ada', '👍', 'off')];

        expect(foldReactions(outOfOrder, VIEWER).get('C1:1')).toEqual([
            { emoji: '👍', key: '👍', userIds: ['ada'], mine: false },
        ]);
    });

    it('treats an emoji with and without its variation selector as one', () => {
        const tallies = foldReactions([reaction(2, 'ada', '❤️'), reaction(3, 'ada', '❤', 'off')], VIEWER);

        expect(tallies.get('C1:1')).toBeUndefined();
    });

    it('keeps skin tones apart — those are different emoji', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍'), reaction(3, 'bob', '👍🏽')], VIEWER);

        expect(tallies.get('C1:1')).toHaveLength(2);
    });

    it('does not double-count a person who reacted twice with the same emoji', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍'), reaction(3, 'ada', '👍')], VIEWER);

        expect(tallies.get('C1:1')?.[0].userIds).toEqual(['ada']);
    });

    it('separates reactions by the message they are on', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍'), reaction(3, 'ada', '👀', 'on', 'C1:9')], VIEWER);

        expect(tallies.get('C1:1')).toHaveLength(1);
        expect(tallies.get('C1:9')).toHaveLength(1);
    });

    it('keys the tally by the target message id the UI looks up', () => {
        const target = message(1);
        const tallies = foldReactions([target, reaction(2, 'ada', '👍', 'on', target.id ?? '')], VIEWER);

        expect(tallies.get(target.id ?? '')).toHaveLength(1);
    });

    it('answers hasMyReaction on the normalised form, not the display string', () => {
        const tallies = foldReactions([reaction(2, ME, '❤️')], VIEWER).get('C1:1');

        expect(hasMyReaction(tallies, '❤')).toBe(true);
        expect(hasMyReaction(tallies, '👍')).toBe(false);
        expect(hasMyReaction(undefined, '❤')).toBe(false);
    });

    it('does not report someone else’s reaction as mine', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍')], VIEWER).get('C1:1');

        expect(hasMyReaction(tallies, '👍')).toBe(false);
    });

    it('ignores ordinary messages and malformed events', () => {
        const noTarget = { ...reaction(2, 'ada', '👍'), reaction$: { emoji: '👍' } } as DomainChat;

        expect(foldReactions([message(1), noTarget], VIEWER).size).toBe(0);
    });

    it('lets an in-flight event outrank the persisted ones', () => {
        const pending = { ...reaction(0, ME, '👍', 'off'), chatNo: 0 } as DomainChat;
        const tallies = foldReactions([reaction(2, ME, '👍'), pending], VIEWER);

        expect(tallies.get('C1:1')).toBeUndefined();
    });

    it('marks a reaction mine when its owner is my cloud id', () => {
        const tallies = foldReactions([reaction(2, ME_CLOUD, '👍')], VIEWER).get('C1:1');

        expect(tallies?.[0]?.mine).toBe(true);
        expect(hasMyReaction(tallies, '👍')).toBe(true);
    });

    it('marks a reaction mine when its owner is my account id', () => {
        expect(foldReactions([reaction(2, ME, '👍')], VIEWER).get('C1:1')?.[0]?.mine).toBe(true);
    });

    it('does not mark someone else’s reaction mine when I have no cloud id', () => {
        const noCloud: MessageViewer = { uid: ME, name: 'Me', cloudUid: null };

        expect(foldReactions([reaction(2, 'ada', '👍')], noCloud).get('C1:1')?.[0]?.mine).toBe(false);
    });

    it('lets my in-flight off cancel my persisted on across the two ids', () => {
        const pending = reaction(0, ME, '👍', 'off');

        expect(foldReactions([reaction(2, ME_CLOUD, '👍'), pending], VIEWER).get('C1:1')).toBeUndefined();
    });

    it('counts me once while my optimistic and persisted events coexist', () => {
        const tallies = foldReactions([reaction(2, ME_CLOUD, '👍'), reaction(0, ME, '👍')], VIEWER).get('C1:1');

        expect(tallies?.[0]?.userIds).toHaveLength(1);
        expect(tallies?.[0]?.mine).toBe(true);
    });
});
