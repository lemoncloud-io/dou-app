import {
    GROUP_MENTION_TOKENS,
    mentionViewerOf,
    mentionWordsFor,
    selfMentionTokens,
    splitMentionRuns,
} from './mentionHighlight';

describe('selfMentionTokens', () => {
    it('turns each of my names into an @ word, once, followed by the everyone words', () => {
        expect(selfMentionTokens(['레인', ' Raine ', '레인', undefined, null, ''])).toEqual([
            '@레인',
            '@Raine',
            ...GROUP_MENTION_TOKENS,
        ]);
    });
});

describe('splitMentionRuns', () => {
    const tokens = selfMentionTokens(['레인', 'Min']);

    it('marks my name and the everyone words, keeping the text around them', () => {
        expect(splitMentionRuns('hi @레인 and @channel!', tokens)).toEqual([
            { value: 'hi ', mention: false },
            { value: '@레인', mention: true },
            { value: ' and ', mention: false },
            { value: '@channel', mention: true },
            { value: '!', mention: false },
        ]);
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
        });
        expect(mentionViewerOf({ roomUid: 'me', sessionUid: 'me', names: [] }).ids).toEqual(['me']);
    });

    it('drops an id that is not known yet', () => {
        expect(mentionViewerOf({ roomUid: null, sessionUid: 'acct-1', names: [] }).ids).toEqual(['acct-1']);
    });
});

describe('mentionWordsFor', () => {
    const viewer = { ids: ['me'], tokens: ['@레인'] };

    it("gives the words for someone else's message whose record calls me", () => {
        expect(mentionWordsFor({ mention$: { userIds: ['me'] } }, viewer)).toEqual(['@레인']);
    });

    it('gives nothing for my own message, a record naming others, or an unknown reader', () => {
        expect(mentionWordsFor({ isOwner: true, mention$: { all: true } }, viewer)).toBeUndefined();
        expect(mentionWordsFor({ mention$: { userIds: ['u2'] } }, viewer)).toBeUndefined();
        expect(mentionWordsFor({ mention$: { all: true } }, undefined)).toBeUndefined();
    });
});
