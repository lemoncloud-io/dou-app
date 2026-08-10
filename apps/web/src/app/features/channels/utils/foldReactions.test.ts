import type { DomainChat } from '@chatic/data';

import { foldReactions, hasMyReaction } from './foldReactions';

const ME = 'me';

/** A reaction event as the server publishes it: its own chat, actor on `ownerId`. */
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

    // The server does not toggle; it records what it was told. An `off` is the absence
    // of that person from the tally, not a decrement.
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

    // Pickers differ on the trailing variation selector; the server folds it away, so
    // the client has to agree or an "off" would never cancel the matching "on".
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

    // The chip lookup is `reactions.get(message.id)`, so the fold has to key by exactly
    // the target message's `id`. Both sides are server-assigned (`ChatModel.id :=
    // <channelId>:<chatNo>`, and `reaction$.chatId` points at one), and `toDomainChat`
    // passes `id` through untouched — this pins the client's half of that assumption,
    // which nothing else in the suite would notice breaking.
    it('keys the tally by the target message id the UI looks up', () => {
        const target = message(1);
        const tallies = foldReactions([target, reaction(2, 'ada', '👍', 'on', target.id ?? '')], ME);

        expect(tallies.get(target.id ?? '')).toHaveLength(1);
    });

    // The picker asks "am I already reacting with this?" through this helper rather than
    // comparing display strings, which differ by variation selector across pickers.
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

    // An optimistic event has no chatNo yet; it must still beat the persisted rows it
    // was just added on top of, or the button would flip back until the echo arrives.
    it('lets an in-flight event outrank the persisted ones', () => {
        const pending = { ...reaction(0, ME, '👍', 'off'), chatNo: 0 } as DomainChat;
        const tallies = foldReactions([reaction(2, ME, '👍'), pending], ME);

        expect(tallies.get('C1:1')).toBeUndefined();
    });
});
