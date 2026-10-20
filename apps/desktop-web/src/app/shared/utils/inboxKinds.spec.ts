import { describe, expect, it } from 'vitest';

import { inboxKindFor, inboxKindOf, isMentionKind } from './inboxKinds';

describe('inboxKindOf', () => {
    // Items stored before the inbox took other sources carry no kind; every one of them was a mention.
    it('reads an item with no kind as a direct mention', () => {
        expect(inboxKindOf({})).toBe('direct');
    });
});

describe('isMentionKind', () => {
    it('counts direct and everyone mentions, and items stored before kinds existed', () => {
        expect(isMentionKind({ kind: 'direct' })).toBe(true);
        expect(isMentionKind({ kind: 'everyone' })).toBe(true);
        expect(isMentionKind({})).toBe(true);
    });

    it('leaves out DMs, replies and reactions', () => {
        expect(isMentionKind({ kind: 'dm' })).toBe(false);
        expect(isMentionKind({ kind: 'reply' })).toBe(false);
        expect(isMentionKind({ kind: 'reaction' })).toBe(false);
    });
});

describe('inboxKindFor', () => {
    it('ranks a reaction over everything else', () => {
        expect(inboxKindFor({ isReaction: true, isDm: true, mention: 'direct' })).toBe('reaction');
    });

    it('ranks a 1:1 message over a mention in it', () => {
        expect(inboxKindFor({ isReaction: false, isDm: true, mention: 'direct' })).toBe('dm');
    });

    it('falls back to the mention, and to nothing when there is none', () => {
        expect(inboxKindFor({ isReaction: false, isDm: false, mention: 'everyone' })).toBe('everyone');
        expect(inboxKindFor({ isReaction: false, isDm: false, mention: null })).toBeNull();
    });
});
