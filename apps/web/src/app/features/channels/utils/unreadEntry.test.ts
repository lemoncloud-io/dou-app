import type { ClientChatView } from '../types';
import { unreadEntryOf } from './unreadEntry';

const row = (chatNo: number, over: Partial<ClientChatView> = {}): ClientChatView =>
    ({ id: `m${chatNo}`, chatNo, isOwner: false, isSystem: false, ...over }) as ClientChatView;

describe('unreadEntryOf', () => {
    it('starts at the first message from someone else past the entry cursor', () => {
        const messages = [row(10), row(11), row(12, { isOwner: true }), row(13), row(14)];
        expect(unreadEntryOf(messages, 12, true)).toEqual({ kind: 'at', chatNo: 13 });
    });

    it('never opens the run with my own message or a system notice', () => {
        const messages = [row(10), row(11, { isOwner: true }), row(12, { isSystem: true }), row(13)];
        expect(unreadEntryOf(messages, 10, false)).toEqual({ kind: 'at', chatNo: 13 });
    });

    it('says nothing is unread when nobody else wrote past the cursor', () => {
        const messages = [row(10), row(11, { isOwner: true })];
        expect(unreadEntryOf(messages, 10, true)).toEqual({ kind: 'none' });
    });

    it('cannot tell while the window starts past the cursor and older history exists', () => {
        const messages = [row(40), row(41)];
        expect(unreadEntryOf(messages, 12, true)).toEqual({ kind: 'unknown' });
        // Asked again once the window cannot grow, it takes what is drawn.
        expect(unreadEntryOf(messages, 12, false)).toEqual({ kind: 'at', chatNo: 40 });
    });
});
