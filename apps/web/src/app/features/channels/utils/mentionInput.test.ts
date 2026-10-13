import {
    applyMentionPick,
    buildMentionCandidates,
    EVERYONE_CANDIDATE_ID,
    collectMention,
    EVERYONE_MENTION,
    filterMentionCandidates,
    findMentionQuery,
    type MentionCandidate,
    mentionedLabels,
    mentionRanges,
    removeWholeMention,
} from './mentionInput';

describe('findMentionQuery', () => {
    it('finds the @ the caret is in and what follows it', () => {
        expect(findMentionQuery('hi @mi', 6)).toEqual({ start: 3, query: 'mi' });
        expect(findMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
    });

    it('reads only up to the caret', () => {
        expect(findMentionQuery('hi @minsu there', 6)).toEqual({ start: 3, query: 'mi' });
    });

    // An e-mail address is not a lookup: the @ has to start a word.
    it('ignores an @ inside a word', () => {
        expect(findMentionQuery('ops@here', 8)).toBeNull();
    });

    it('closes once whitespace follows the name', () => {
        expect(findMentionQuery('@min ', 5)).toBeNull();
        expect(findMentionQuery('hello', 5)).toBeNull();
    });

    it('works with Hangul names', () => {
        expect(findMentionQuery('안녕 @레', 5)).toEqual({ start: 3, query: '레' });
    });
});

describe('applyMentionPick', () => {
    it('replaces the typed query with the name and a space, and puts the caret after it', () => {
        expect(applyMentionPick('hi @mi', { start: 3, query: 'mi' }, 6, 'Minsu')).toEqual({
            text: 'hi @Minsu ',
            caret: 10,
        });
    });

    it('keeps the text after the caret and reuses the space already there', () => {
        expect(applyMentionPick('hi @mi there', { start: 3, query: 'mi' }, 6, 'Minsu')).toEqual({
            text: 'hi @Minsu there',
            caret: 10,
        });
    });

    // Picking with the caret inside `@Mi|nsu` must not leave `nsu` behind.
    it('replaces the whole @ word, not only what is before the caret', () => {
        expect(applyMentionPick('@Minsu look', { start: 0, query: 'Mi' }, 3, '레인')).toEqual({
            text: '@레인 look',
            caret: 4,
        });
    });
});

describe('mentionedLabels', () => {
    it('finds a name as a whole word, a name with a space in it included', () => {
        expect(mentionedLabels('hi @Minsu!', ['Minsu'])).toEqual(new Set(['Minsu']));
        expect(mentionedLabels('@Kim Min look', ['Kim Min'])).toEqual(new Set(['Kim Min']));
    });

    it('does not find a name that runs on into more of a name or sits inside a word', () => {
        expect(mentionedLabels('hi @Minsu', ['Min'])).toEqual(new Set());
        expect(mentionedLabels('hi @Min-jun', ['Min'])).toEqual(new Set());
        expect(mentionedLabels('ops@Min', ['Min'])).toEqual(new Set());
    });

    // A particle or honorific written straight after a Korean name is still that name.
    it('finds a name with a Korean particle or honorific after it', () => {
        expect(mentionedLabels('@민수님 확인 부탁드려요', ['민수'])).toEqual(new Set(['민수']));
        expect(mentionedLabels('@민수가 올렸어요', ['민수'])).toEqual(new Set(['민수']));
    });

    it('takes the longest name the text holds where one name starts another', () => {
        expect(mentionedLabels('@민수 @민 안녕', ['민', '민수'])).toEqual(new Set(['민수', '민']));
        expect(mentionedLabels('@민수님', ['민', '민수'])).toEqual(new Set(['민수']));
    });

    it('treats the name literally', () => {
        expect(mentionedLabels('@a.b', ['a.b'])).toEqual(new Set(['a.b']));
        expect(mentionedLabels('@axb', ['a.b'])).toEqual(new Set());
    });
});

describe('mentionRanges', () => {
    it('places each @name from its @ to its last letter', () => {
        expect(mentionRanges('hi @Minsu and @레인님', ['Minsu', '레인'])).toEqual([
            { start: 3, end: 9, label: 'Minsu' },
            { start: 14, end: 17, label: '레인' },
        ]);
    });
});

describe('removeWholeMention', () => {
    it('takes the whole picked name on a backspace at its end', () => {
        expect(removeWholeMention('hi @Minsu', 'hi @Mins', ['Minsu'])).toEqual({
            text: 'hi ',
            caret: 3,
            label: 'Minsu',
        });
        expect(removeWholeMention('@Minsu look', '@Mins look', ['Minsu'])).toEqual({
            text: ' look',
            caret: 0,
            label: 'Minsu',
        });
    });

    // A Korean keyboard can break the last syllable back into its consonant instead of deleting it.
    it('takes it when the last syllable breaks into its consonant', () => {
        expect(removeWholeMention('@민수', '@민ㅅ', ['민수'])?.text).toBe('');
    });

    it('leaves the space after the name to an ordinary backspace', () => {
        expect(removeWholeMention('@Minsu ', '@Minsu', ['Minsu'])).toBeNull();
    });

    it('leaves a name typed by hand, typing, and a deletion past the name alone', () => {
        expect(removeWholeMention('@Minsu', '@Mins', [])).toBeNull();
        expect(removeWholeMention('@Minsu', '@Mins', ['레인'])).toBeNull();
        expect(removeWholeMention('@Mins', '@Minsu', ['Minsu'])).toBeNull();
        expect(removeWholeMention('@Minsu ok', '@Min', ['Minsu'])).toBeNull();
    });

    // With both in the room, `@민수` ends after `수`; deleting it is not a backspace at the end of `민`.
    it("measures the name by the room's longest one", () => {
        expect(removeWholeMention('@민수', '@민', ['민'], ['민', '민수'])).toBeNull();
    });
});

describe('collectMention', () => {
    const minsu = { label: 'Minsu', userId: 'u2' };
    const everyone = { label: EVERYONE_MENTION, everyone: true };

    it('sends the picks still in the text', () => {
        expect(collectMention('@Minsu @channel look', [minsu, everyone])).toEqual({ userIds: ['u2'], all: true });
    });

    // A pick whose name was deleted, or an @name typed by hand, mentions nobody.
    it('drops a pick whose name was deleted, and sends nothing when none is left', () => {
        expect(collectMention('@channel look', [minsu, everyone])).toEqual({ all: true });
        expect(collectMention('@Minsu typed by hand', [])).toBeUndefined();
        expect(collectMention('look', [minsu])).toBeUndefined();
    });

    it('sends a person picked twice once', () => {
        expect(collectMention('@Minsu @Minsu', [minsu, minsu])).toEqual({ userIds: ['u2'] });
    });

    // With `민` and `민수` both in the room, `@민수` names `민수`, even if only `민` was picked.
    it("does not count a pick inside a longer name the room's list offers", () => {
        const min = { label: '민', userId: 'u4' };
        expect(collectMention('@민수 안녕', [min], ['민', '민수'])).toBeUndefined();
        expect(collectMention('@민 안녕', [min], ['민', '민수'])).toEqual({ userIds: ['u4'] });
    });
});

describe('filterMentionCandidates', () => {
    const rows: MentionCandidate[] = [
        { id: '@everyone', label: EVERYONE_MENTION, everyone: true, keywords: ['모두에게'] },
        { id: 'u2', label: 'Minsu' },
        { id: 'u3', label: '레인' },
    ];

    it('offers everything for a bare @', () => {
        expect(filterMentionCandidates(rows, '').map(row => row.id)).toEqual(['@everyone', 'u2', 'u3']);
    });

    it('matches a name anywhere in it, ignoring case', () => {
        expect(filterMentionCandidates(rows, 'NSU').map(row => row.id)).toEqual(['u2']);
        expect(filterMentionCandidates(rows, '레').map(row => row.id)).toEqual(['u3']);
    });

    // On a Korean keyboard each syllable starts as a lone consonant; matching it would empty the list.
    it('leaves a trailing lone jamo out of the match', () => {
        expect(filterMentionCandidates(rows, '레ㅇ').map(row => row.id)).toEqual(['u3']);
        expect(filterMentionCandidates(rows, 'ㄹ').map(row => row.id)).toEqual(['@everyone', 'u2', 'u3']);
    });

    it('finds the everyone row by any of its names, the localized one included', () => {
        expect(filterMentionCandidates(rows, 'here').map(row => row.id)).toEqual(['@everyone']);
        expect(filterMentionCandidates(rows, '모두').map(row => row.id)).toEqual(['@everyone']);
    });
});

describe('buildMentionCandidates', () => {
    const names: Record<string, string> = { me: '나', u2: 'Minsu', u3: '레인', u4: 'unknown' };
    const build = (memberIds: string[]) =>
        buildMentionCandidates({
            memberIds,
            me: 'me',
            nameOf: id => names[id] ?? 'unknown',
            avatarOf: id => (id === 'u2' ? 'https://example.test/u2.png' : undefined),
            unknownLabel: 'unknown',
            everyoneKeyword: '모두에게',
        });

    it('puts everyone first, then the other members by name, without me', () => {
        expect(build(['u3', 'me', 'u2']).map(row => row.id)).toEqual([EVERYONE_CANDIDATE_ID, 'u2', 'u3']);
    });

    it('labels a member by their name and carries their photo', () => {
        expect(build(['u2'])[1]).toEqual({ id: 'u2', label: 'Minsu', thumbnail: 'https://example.test/u2.png' });
    });

    // A person shown as "unknown user" cannot be written into the text as a name.
    it('leaves out a member with no name yet', () => {
        expect(build(['u4']).map(row => row.id)).toEqual([EVERYONE_CANDIDATE_ID]);
    });

    it('lets the everyone row answer its localized title', () => {
        expect(build([])[0]).toMatchObject({ everyone: true, label: EVERYONE_MENTION, keywords: ['모두에게'] });
    });
});
