import {
    GROUP_MENTION_TOKENS,
    mentionMarksFor,
    mentionTokensOf,
    mentionViewerOf,
    splitMentionRuns,
} from './mentionHighlight';

describe('mentionTokensOf', () => {
    it('turns each name into an @ word, once, followed by the everyone words', () => {
        expect(mentionTokensOf(['레인', ' Raine ', '레인', undefined, null, ''])).toEqual([
            '@레인',
            '@Raine',
            ...GROUP_MENTION_TOKENS,
        ]);
    });
});

describe('splitMentionRuns', () => {
    const tokens = mentionTokensOf(['레인', 'Min']);

    it('marks my name and the everyone words, keeping the text around them', () => {
        expect(splitMentionRuns('hi @레인 and @channel!', tokens)).toEqual([
            { value: 'hi ', mention: false },
            { value: '@레인', mention: true },
            { value: ' and ', mention: false },
            { value: '@channel', mention: true },
            { value: '!', mention: false },
        ]);
    });

    // The everyone pick writes `@all` or `@전체` by the sender's language; a reader in either marks both.
    it('marks the everyone word of either language, and not a longer word starting with it', () => {
        expect(
            splitMentionRuns('@all @전체님 @allison', tokens)
                .filter(run => run.mention)
                .map(run => run.value)
        ).toEqual(['@all', '@전체']);
    });

    it('matches regardless of case, keeping the text as written', () => {
        expect(splitMentionRuns('@HERE now', tokens)).toEqual([
            { value: '@HERE', mention: true },
            { value: ' now', mention: false },
        ]);
    });

    // A longer name that starts with mine, and an @ inside a word, are somebody else's text.
    it('leaves a longer name and an @ inside a word alone', () => {
        expect(splitMentionRuns('@Minsu ops@Min', tokens)).toEqual([{ value: '@Minsu ops@Min', mention: false }]);
        expect(splitMentionRuns('@Min-jun', tokens)).toEqual([{ value: '@Min-jun', mention: false }]);
    });

    // The composer counts a pick the same way: a particle or honorific after the name is still the name.
    it('marks my name with a Korean particle or honorific written straight after it', () => {
        expect(splitMentionRuns('@레인님 확인요', tokens)).toEqual([
            { value: '@레인', mention: true },
            { value: '님 확인요', mention: false },
        ]);
    });

    it('marks two mentions side by side', () => {
        expect(
            splitMentionRuns('@레인 @here', tokens)
                .filter(run => run.mention)
                .map(run => run.value)
        ).toEqual(['@레인', '@here']);
    });

    it('returns the text as one run without tokens, and nothing for empty text', () => {
        expect(splitMentionRuns('hello', [])).toEqual([{ value: 'hello', mention: false }]);
        expect(splitMentionRuns('', tokens)).toEqual([]);
    });

    it('treats a name literally', () => {
        expect(splitMentionRuns('@a.b @axb', ['@a.b'])).toEqual([
            { value: '@a.b', mention: true },
            { value: ' @axb', mention: false },
        ]);
    });
});

describe('mentionViewerOf', () => {
    it('keeps both of my ids once and turns my names into words', () => {
        expect(mentionViewerOf({ roomUid: 'cloud-7', sessionUid: 'acct-1', names: ['레인', undefined] })).toEqual({
            ids: ['cloud-7', 'acct-1'],
            tokens: ['@레인', ...GROUP_MENTION_TOKENS],
            roomTokens: [],
            people: new Map(),
        });
        expect(mentionViewerOf({ roomUid: 'me', sessionUid: 'me', names: [] }).ids).toEqual(['me']);
    });

    it('drops an id that is not known yet', () => {
        expect(mentionViewerOf({ roomUid: null, sessionUid: 'acct-1', names: [] }).ids).toEqual(['acct-1']);
    });

    // A group room draws every member's mention; mine are among them.
    it("turns a group room's members and my names into the room's words", () => {
        expect(
            mentionViewerOf({ roomUid: 'me', sessionUid: 'me', names: ['레인'], memberNames: ['Minsu', '레인'] })
                .roomTokens
        ).toEqual(['@Minsu', '@레인', ...GROUP_MENTION_TOKENS]);
    });

    it('finds each member by their @name, whatever its case', () => {
        const minsu = { id: 'u2', name: 'Minsu' };
        const viewer = mentionViewerOf({ roomUid: 'me', sessionUid: 'me', names: [], people: [minsu] });

        expect(viewer.people.get('@minsu')).toBe(minsu);
    });

    // `@All` in the text calls everyone; it cannot also be a tap on a member who happens to be named so.
    it('opens no member for a name that is an everyone word', () => {
        const people = [
            { id: 'u5', name: 'All' },
            { id: 'u6', name: '전체' },
            { id: 'u7', name: 'Allison' },
        ];
        const viewer = mentionViewerOf({ roomUid: 'me', sessionUid: 'me', names: [], people });

        expect([...viewer.people.keys()]).toEqual(['@allison']);
    });
});

describe('mentionMarksFor', () => {
    const people = new Map([['@minsu', { id: 'u2', name: 'Minsu' }]]);
    const viewer = { ids: ['me'], tokens: ['@레인'], roomTokens: ['@레인', '@Minsu'], people };

    it("draws the room's words on any message, and mine louder when the record calls me", () => {
        expect(mentionMarksFor({ mention$: { userIds: ['me'] } }, viewer)).toEqual({
            words: ['@레인', '@Minsu', '@레인'],
            self: ['@레인'],
            own: false,
            people,
        });
        expect(mentionMarksFor({ mention$: { userIds: ['u2'] } }, viewer)?.self).toEqual([]);
    });

    // A message with no record is read by its text, in a group room only.
    it('falls back to the text for a message with no record', () => {
        expect(mentionMarksFor({}, viewer)?.self).toEqual(['@레인']);
        expect(mentionMarksFor({}, { ...viewer, roomTokens: [] })).toBeUndefined();
    });

    it('never draws my own message as calling me', () => {
        expect(mentionMarksFor({ isOwner: true, mention$: { all: true } }, viewer)).toEqual({
            words: ['@레인', '@Minsu'],
            self: [],
            own: true,
            people,
        });
    });

    it('draws nothing for an unknown reader, or outside a group room with no mention of me', () => {
        expect(mentionMarksFor({ mention$: { all: true } }, undefined)).toBeUndefined();
        expect(mentionMarksFor({}, { ids: ['me'], tokens: ['@레인'], roomTokens: [], people })).toBeUndefined();
    });
});
