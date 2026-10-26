import { describe, expect, it } from 'vitest';

import { inboxKindFor, inboxKindOf, inboxPlaceScope, isInInboxScope, isMentionKind } from './inboxKinds';

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

describe('inboxPlaceScope', () => {
    it('is the selected place on a cloud, whatever else the cloud holds', () => {
        const scope = inboxPlaceScope({ isDefaultMode: false, selectedPlaceId: 'P1', placeIds: ['P1', 'P2'] });
        expect([...scope]).toEqual(['P1']);
    });

    it("is every listed place on the Default Cloud, not its 'default' sentinel", () => {
        const scope = inboxPlaceScope({
            isDefaultMode: true,
            selectedPlaceId: 'default',
            placeIds: ['R1', undefined, 'R2'],
        });
        expect([...scope]).toEqual(['R1', 'R2']);
    });

    it('is empty while no place is selected yet', () => {
        expect(inboxPlaceScope({ isDefaultMode: false, selectedPlaceId: null, placeIds: ['P1'] }).size).toBe(0);
    });
});

describe('isInInboxScope', () => {
    const scope = new Set(['P1']);

    it("takes an item of a scoped place and leaves out another place's", () => {
        expect(isInInboxScope({ placeId: 'P1' }, scope)).toBe(true);
        expect(isInInboxScope({ placeId: 'P2' }, scope)).toBe(false);
    });

    it('takes an item stored before items carried a place', () => {
        expect(isInInboxScope({}, scope)).toBe(true);
    });
});
