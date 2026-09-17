import type { DomainChat } from './models';
import { canModifyMessage, isMessageEdited } from './messageEdit';

const chat = (overrides: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: 'ch-1:4',
        cid: 'cloud-a',
        channelId: 'ch-1',
        chatNo: 4,
        content: 'hello',
        ownerId: 'me',
        createdAt: 1000,
        updatedAt: 1000,
        isPending: false,
        isFailed: false,
        ...overrides,
    }) as DomainChat;

describe('canModifyMessage', () => {
    it('allows a settled message of mine', () => {
        expect(canModifyMessage(chat(), true)).toBe(true);
    });

    it("refuses someone else's message", () => {
        expect(canModifyMessage(chat(), false)).toBe(false);
    });

    // Both operations address the message by its server id, so a row that has none is out.
    it('refuses a message the server has not confirmed', () => {
        expect(canModifyMessage(chat({ id: '' }), true)).toBe(false);
        expect(canModifyMessage(chat({ isPending: true }), true)).toBe(false);
    });

    it('refuses a message whose send failed — the outbox owns it', () => {
        expect(canModifyMessage(chat({ isFailed: true }), true)).toBe(false);
    });

    it("refuses a system message — it is the server's transcript", () => {
        expect(canModifyMessage(chat({ stereo: 'system' }), true)).toBe(false);
    });

    it('refuses an already-deleted message', () => {
        expect(canModifyMessage(chat({ hidden: true }), true)).toBe(false);
    });

    // The server models `hidden` as 0/1; only the view type narrows it. `=== true` would let a
    // deleted message be edited the first time a 1 arrives on the wire.
    it('treats a numeric hidden as deleted, not just a boolean one', () => {
        expect(canModifyMessage(chat({ hidden: 1 as unknown as boolean }), true)).toBe(false);
    });
});

describe('isMessageEdited', () => {
    it('says no for a message nobody has touched', () => {
        expect(isMessageEdited(chat({ createdAt: 1000, updatedAt: 1000 }))).toBe(false);
    });

    it('says yes once the row has been written again', () => {
        expect(isMessageEdited(chat({ createdAt: 1000, updatedAt: 2000 }))).toBe(true);
    });

    // A delete is a PUT on the same row, so it moves updatedAt too — but
    // "This message was deleted. (edited)" is nonsense.
    it('says no for a deleted message even though its timestamp moved', () => {
        expect(isMessageEdited(chat({ createdAt: 1000, updatedAt: 2000, hidden: true }))).toBe(false);
        expect(isMessageEdited(chat({ createdAt: 1000, updatedAt: 2000, hidden: 1 as unknown as boolean }))).toBe(
            false
        );
    });

    it('says no for a message that has not reached the server', () => {
        expect(isMessageEdited(chat({ createdAt: 1000, updatedAt: 2000, isPending: true }))).toBe(false);
    });

    // No basis to judge — say no rather than guess.
    it('says no when the timestamps are missing', () => {
        expect(isMessageEdited(chat({ createdAt: undefined, updatedAt: undefined }))).toBe(false);
        expect(isMessageEdited(chat({ createdAt: 0, updatedAt: 2000 }))).toBe(false);
    });
});
