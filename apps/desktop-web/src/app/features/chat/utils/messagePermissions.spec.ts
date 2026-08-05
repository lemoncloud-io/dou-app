import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { canModifyMessage } from './messagePermissions';

const chat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'C1:4', channelId: 'C1', chatNo: 4, content: 'hi', ...over }) as DomainChat;

describe('canModifyMessage', () => {
    it('allows my own persisted message', () => {
        expect(canModifyMessage(chat(), true)).toBe(true);
    });

    it('refuses someone else’s message', () => {
        expect(canModifyMessage(chat(), false)).toBe(false);
    });

    // Both operations address the message by server id, which these do not have yet.
    it('refuses a message still in flight', () => {
        expect(canModifyMessage(chat({ isPending: true }), true)).toBe(false);
        expect(canModifyMessage(chat({ id: undefined }), true)).toBe(false);
    });

    it('refuses a failed send — that one is retried or discarded, not edited', () => {
        expect(canModifyMessage(chat({ isFailed: true }), true)).toBe(false);
    });

    it('refuses a system row — the server wrote it, not me', () => {
        expect(canModifyMessage(chat({ stereo: 'system', subType: 'join' }), true)).toBe(false);
    });

    it('refuses an already-deleted message', () => {
        expect(canModifyMessage(chat({ hidden: true }), true)).toBe(false);
    });
});
