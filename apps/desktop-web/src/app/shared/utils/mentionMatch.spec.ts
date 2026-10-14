import { describe, expect, it } from 'vitest';

import { isMentioned, isNamedByRecord, mentionKind, mentionsMe } from './mentionMatch';

describe('isMentioned', () => {
    it.each(['@channel', '@here', '@everyone', '@all', '@전체'])('reads %s as calling everyone', word => {
        expect(isMentioned(`${word} standup in 5`, ['Ada'])).toBe(true);
    });

    // `@all` starts many ordinary words and addresses; only the word on its own calls everyone.
    it('does not read a word or an address that merely starts with a group token', () => {
        expect(isMentioned('ping @Allison', ['Ada'])).toBe(false);
        expect(isMentioned('mail bob@allbirds.com', ['Ada'])).toBe(false);
        expect(isMentioned('see x@all', ['Ada'])).toBe(false);
        expect(isMentioned('@전체회의 공지', ['Ada'])).toBe(false);
    });

    it('reads a group token next to punctuation, in any case', () => {
        expect(isMentioned('(@all) heads up', ['Ada'])).toBe(true);
        expect(isMentioned('standup, @HERE.', ['Ada'])).toBe(true);
    });

    it('reads my own name', () => {
        expect(isMentioned('ping @ada', ['Ada'])).toBe(true);
    });

    it('does not read a message with no @ or no matching name', () => {
        expect(isMentioned('all hands at 3', ['Ada'])).toBe(false);
        expect(isMentioned('ping @Bo', ['Ada'])).toBe(false);
    });
});

// The sender's composer records who it picked, and the server tells exactly those members. The
// record is the answer whenever a message has one; the text is a guess kept for messages that have
// none (an older client, a webhook).
describe('mentionsMe', () => {
    const ME = ['acct-1', 'cloud-user-9'];

    it('goes by the record when it names me, whatever the text calls me', () => {
        expect(mentionsMe({ mention$: { userIds: ['cloud-user-9'] } }, ME, '@Nickname hi', ['Me'])).toBe(true);
    });

    it('goes by the record when it does not name me, though the text has my name', () => {
        expect(mentionsMe({ mention$: { userIds: ['u-other'] } }, ME, 'hi @Me', ['Me'])).toBe(false);
    });

    // A read gives `true`, a live `chat.sync` the model's `1`.
    it.each([true, 1] as const)('counts a record that calls everyone (%j)', all => {
        expect(mentionsMe({ mention$: { all } }, ME, 'standup', ['Me'])).toBe(true);
    });

    it('does not let a typed group word override a record that calls someone else', () => {
        expect(mentionsMe({ mention$: { userIds: ['u-other'] } }, ME, '@channel hi', ['Me'])).toBe(false);
    });

    it.each([
        ['my name', 'hi @Me', true],
        ['a group word', '@here hi', true],
        ['neither', 'hi @Bo', false],
    ])('reads the text of a message with no record: %s', (_name, text, expected) => {
        expect(mentionsMe({}, ME, text, ['Me'])).toBe(expected);
    });
});

// One decision point for "was I called, and how": the banner title and the
// mention-only filter must agree, so they share this answer.
describe('mentionKind', () => {
    const ME = ['acct-1', 'cloud-user-9'];

    it('reads a record that names me as a direct mention, whatever the text says', () => {
        expect(mentionKind({ mention$: { userIds: ['cloud-user-9'] } }, ME, '@Nickname hi', ['Me'])).toBe('direct');
    });

    it('reads a record that calls everyone', () => {
        expect(mentionKind({ mention$: { all: true } }, ME, 'standup', ['Me'])).toBe('everyone');
    });

    // A read gives `true`, a live `chat.sync` the model's `1`.
    it.each([true, 1] as const)('reads a numeric everyone record (%j)', all => {
        expect(mentionKind({ mention$: { all } }, ME, 'standup', ['Me'])).toBe('everyone');
    });

    it('prefers a direct naming over everyone in the same record', () => {
        expect(mentionKind({ mention$: { userIds: ['cloud-user-9'], all: true } }, ME, 'hi', ['Me'])).toBe(
            'direct'
        );
    });

    it('returns null for a record that names someone else, though the text has my name', () => {
        expect(mentionKind({ mention$: { userIds: ['u-other'] } }, ME, 'hi @Me', ['Me'])).toBeNull();
    });

    it('does not let a typed group word override a record that calls someone else', () => {
        expect(mentionKind({ mention$: { userIds: ['u-other'] } }, ME, '@channel hi', ['Me'])).toBeNull();
    });

    it('reads my name in the text of a message with no record', () => {
        expect(mentionKind({}, ME, 'hi @Me', ['Me'])).toBe('direct');
    });

    it('reads a group word in the text of a message with no record', () => {
        expect(mentionKind({}, ME, '@here hi', ['Me'])).toBe('everyone');
    });

    it('prefers my name over a group word in the same text', () => {
        expect(mentionKind({}, ME, 'hi @Me @channel', ['Me'])).toBe('direct');
    });

    it('returns null when the text calls nobody', () => {
        expect(mentionKind({}, ME, 'hi @Bo', ['Me'])).toBeNull();
    });
});

// The quiet-hours breakthrough's only condition: a record naming me, never the
// text and never an everyone flag.
describe('isNamedByRecord', () => {
    const ME = ['acct-1', 'cloud-user-9'];

    it.each([['acct-1'], ['cloud-user-9']] as const)('reads a record naming my id %s', id => {
        expect(isNamedByRecord({ mention$: { userIds: [id] } }, ME)).toBe(true);
    });

    it('does not read an everyone record', () => {
        expect(isNamedByRecord({ mention$: { all: true } }, ME)).toBe(false);
    });

    it('does not read a record naming someone else', () => {
        expect(isNamedByRecord({ mention$: { userIds: ['u-other'] } }, ME)).toBe(false);
    });

    it('does not read a message with no record, whatever the text says', () => {
        expect(isNamedByRecord({}, ME)).toBe(false);
    });
});
