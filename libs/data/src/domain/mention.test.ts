import { isMentioningViewer, toMentionBody, toMentionRecord } from './mention';

// `all` reaches the cache as `1` from a live `chat.sync`, which the view type does not admit.
const chat = (mention$: unknown) => ({ mention$ }) as never;

describe('isMentioningViewer', () => {
    it('is true when the record names one of my ids', () => {
        expect(isMentioningViewer(chat({ userIds: ['u1', 'u2'] }), ['u2'])).toBe(true);
    });

    // In a subscription cloud the record holds channel member ids, which are cloud user ids, not
    // the account uid. Only checking the account uid would miss every mention in a cloud room.
    it('matches the cloud user id when the account uid is not in the record', () => {
        expect(isMentioningViewer(chat({ userIds: ['cloud-7'] }), ['account-1', 'cloud-7'])).toBe(true);
    });

    it('is true for everyone, whether it arrived as true from a read or as 1 from chat.sync', () => {
        expect(isMentioningViewer(chat({ all: true }), ['u1'])).toBe(true);
        expect(isMentioningViewer(chat({ all: 1 }), ['u1'])).toBe(true);
    });

    it('is false when the record names only other people', () => {
        expect(isMentioningViewer(chat({ userIds: ['u2'] }), ['u1'])).toBe(false);
    });

    it('is false without a record, and ignores empty viewer ids', () => {
        expect(isMentioningViewer(chat(undefined), ['u1'])).toBe(false);
        expect(isMentioningViewer(null, ['u1'])).toBe(false);
        expect(isMentioningViewer(chat({ userIds: [''] }), ['', null, undefined])).toBe(false);
    });

    it('does not read all: 0 or a falsy flag as everyone', () => {
        expect(isMentioningViewer(chat({ all: 0 }), ['u1'])).toBe(false);
        expect(isMentioningViewer(chat({ all: false }), ['u1'])).toBe(false);
    });
});

describe('toMentionRecord', () => {
    it('keeps the picked ids and everyone', () => {
        expect(toMentionRecord({ userIds: ['u1'], all: true })).toEqual({ userIds: ['u1'], all: true });
    });

    it('drops empty ids and returns nothing when nothing is left', () => {
        expect(toMentionRecord({ userIds: ['', 'u1'] })).toEqual({ userIds: ['u1'] });
        expect(toMentionRecord({ userIds: [''] })).toBeUndefined();
        expect(toMentionRecord({ all: false })).toBeUndefined();
        expect(toMentionRecord(undefined)).toBeUndefined();
    });
});

describe('toMentionBody', () => {
    // The server takes only `true` for everyone; a record's 1 has to go back out as true.
    it('turns a chat.sync 1 back into true', () => {
        expect(toMentionBody({ all: 1 } as never)).toEqual({ all: true });
    });

    it('carries the ids across and returns nothing for an empty record', () => {
        expect(toMentionBody({ userIds: ['u1', 'u2'] })).toEqual({ userIds: ['u1', 'u2'] });
        expect(toMentionBody({ userIds: [] })).toBeUndefined();
        expect(toMentionBody(undefined)).toBeUndefined();
    });

    it('round-trips with toMentionRecord', () => {
        const body = { userIds: ['u1'], all: true };
        expect(toMentionBody(toMentionRecord(body))).toEqual(body);
    });
});
