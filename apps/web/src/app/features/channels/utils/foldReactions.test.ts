import type { DomainChat } from '@chatic/runtime';

import { foldReactions, hasMyReaction } from './foldReactions';

const ME = 'me';

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
        const tallies = foldReactions([message(1), reaction(2, 'ada', '👍'), reaction(3, 'bob', '👍')], ME);

        expect(tallies.get('C1:1')).toEqual([{ emoji: '👍', key: '👍', userIds: ['ada', 'bob'], mine: false }]);
    });

    it('marks the tally the signed-in user is part of', () => {
        const tallies = foldReactions([reaction(2, ME, '🎉')], ME);

        expect(tallies.get('C1:1')?.[0]).toMatchObject({ mine: true });
    });

    it('lets a later off remove the person again', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍'), reaction(3, 'ada', '👍', 'off')], ME);

        expect(tallies.get('C1:1')).toBeUndefined();
    });

    it('keeps the newest event per person and emoji regardless of arrival order', () => {
        const outOfOrder = [reaction(5, 'ada', '👍'), reaction(3, 'ada', '👍', 'off')];

        expect(foldReactions(outOfOrder, ME).get('C1:1')).toEqual([
            { emoji: '👍', key: '👍', userIds: ['ada'], mine: false },
        ]);
    });

    it('treats an emoji with and without its variation selector as one', () => {
        const tallies = foldReactions([reaction(2, 'ada', '❤️'), reaction(3, 'ada', '❤', 'off')], ME);

        expect(tallies.get('C1:1')).toBeUndefined();
    });

    it('keeps skin tones apart — those are different emoji', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍'), reaction(3, 'bob', '👍🏽')], ME);

        expect(tallies.get('C1:1')).toHaveLength(2);
    });

    it('does not double-count a person who reacted twice with the same emoji', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍'), reaction(3, 'ada', '👍')], ME);

        expect(tallies.get('C1:1')?.[0].userIds).toEqual(['ada']);
    });

    it('separates reactions by the message they are on', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍'), reaction(3, 'ada', '👀', 'on', 'C1:9')], ME);

        expect(tallies.get('C1:1')).toHaveLength(1);
        expect(tallies.get('C1:9')).toHaveLength(1);
    });

    it('keys the tally by the target message id the UI looks up', () => {
        const target = message(1);
        const tallies = foldReactions([target, reaction(2, 'ada', '👍', 'on', target.id ?? '')], ME);

        expect(tallies.get(target.id ?? '')).toHaveLength(1);
    });

    it('answers hasMyReaction on the normalised form, not the display string', () => {
        const tallies = foldReactions([reaction(2, ME, '❤️')], ME).get('C1:1');

        expect(hasMyReaction(tallies, '❤')).toBe(true);
        expect(hasMyReaction(tallies, '👍')).toBe(false);
        expect(hasMyReaction(undefined, '❤')).toBe(false);
    });

    it('does not report someone else’s reaction as mine', () => {
        const tallies = foldReactions([reaction(2, 'ada', '👍')], ME).get('C1:1');

        expect(hasMyReaction(tallies, '👍')).toBe(false);
    });

    it('ignores ordinary messages and malformed events', () => {
        const noTarget = { ...reaction(2, 'ada', '👍'), reaction$: { emoji: '👍' } } as DomainChat;

        expect(foldReactions([message(1), noTarget], ME).size).toBe(0);
    });

    it('lets an in-flight event outrank the persisted ones', () => {
        const pending = { ...reaction(0, ME, '👍', 'off'), chatNo: 0 } as DomainChat;
        const tallies = foldReactions([reaction(2, ME, '👍'), pending], ME);

        expect(tallies.get('C1:1')).toBeUndefined();
    });
});
