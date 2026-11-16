import { classifyMessage, keepsMentionsOnly, type MessageFacts } from './classify';

const facts = (overrides: Partial<MessageFacts> = {}): MessageFacts => ({
    isThreadReply: false,
    mentionsMe: false,
    isDm: false,
    thread: 'none',
    mentionsOnly: false,
    ...overrides,
});

describe('classifyMessage', () => {
    it('files a top-level message that calls me as a mention', () => {
        expect(classifyMessage(facts({ mentionsMe: true }))).toBe('mention');
    });

    it('files a thread reply that calls me as a thread mention, ahead of any thread relation', () => {
        expect(classifyMessage(facts({ isThreadReply: true, mentionsMe: true, thread: 'rootMine' }))).toBe(
            'threadMention'
        );
    });

    it('puts a mention ahead of a 1:1 message', () => {
        expect(classifyMessage(facts({ mentionsMe: true, isDm: true }))).toBe('mention');
    });

    it('files a reply in a thread whose root is mine as a reply to mine', () => {
        expect(classifyMessage(facts({ isThreadReply: true, thread: 'rootMine' }))).toBe('replyToMine');
    });

    it('files a reply in a thread I joined as a participated thread', () => {
        expect(classifyMessage(facts({ isThreadReply: true, thread: 'participated' }))).toBe('participatedThread');
    });

    it('puts a thread relation ahead of a 1:1 message', () => {
        expect(classifyMessage(facts({ isThreadReply: true, thread: 'rootMine', isDm: true }))).toBe('replyToMine');
    });

    it('files any other 1:1 message as a 1:1 message', () => {
        expect(classifyMessage(facts({ isDm: true }))).toBe('dmMessage');
        expect(classifyMessage(facts({ isDm: true, isThreadReply: true }))).toBe('dmMessage');
    });

    it('leaves out an ordinary group message, and a reply in a thread I have no part in', () => {
        expect(classifyMessage(facts())).toBeNull();
        expect(classifyMessage(facts({ isThreadReply: true }))).toBeNull();
    });

    it('ignores a thread relation on a top-level message', () => {
        expect(classifyMessage(facts({ thread: 'rootMine' }))).toBeNull();
    });

    it('keeps only mentions in a room down to mentions', () => {
        expect(classifyMessage(facts({ mentionsOnly: true, mentionsMe: true }))).toBe('mention');
        expect(classifyMessage(facts({ mentionsOnly: true, isDm: true }))).toBeNull();
        expect(classifyMessage(facts({ mentionsOnly: true, isThreadReply: true, thread: 'rootMine' }))).toBeNull();
    });
});

describe('keepsMentionsOnly', () => {
    it('is true for a room turned off or down to mentions', () => {
        expect(keepsMentionsOnly('none', false)).toBe(true);
        expect(keepsMentionsOnly('mention', false)).toBe(true);
        expect(keepsMentionsOnly('none', true)).toBe(true);
    });

    it('is false for the default levels, and for mentions-only in a 1:1', () => {
        expect(keepsMentionsOnly('all', false)).toBe(false);
        expect(keepsMentionsOnly('', false)).toBe(false);
        expect(keepsMentionsOnly(undefined, false)).toBe(false);
        expect(keepsMentionsOnly('mention', true)).toBe(false);
    });
});
