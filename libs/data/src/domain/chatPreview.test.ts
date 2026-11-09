import type { DomainChat } from './models';
import {
    compareByChatNo,
    isActivityChat,
    isEventChat,
    isFeedVisible,
    isPreviewableChat,
    pickActivityChat,
    pickPreviewChat,
} from './chatPreview';

// The preview-decision cases that apps/web's useLastChat (the per-row subscription hook, retired by
// ADR-0057) used to cover, ported to a pure-function unit. This decision is shared by the home and
// admin list renders and by the last-chat fallback path.
const chat = (chatNo: number, content: string, fields: Partial<DomainChat> = {}): DomainChat =>
    ({ chatNo, content, ...fields }) as unknown as DomainChat;

describe('pickPreviewChat', () => {
    it('an empty window is undefined — no preview', () => {
        expect(pickPreviewChat([])).toBeUndefined();
    });

    it('picks the max-chatNo message regardless of sort order', () => {
        expect(pickPreviewChat([chat(5, 'a'), chat(9, 'c'), chat(7, 'b')])).toEqual(chat(9, 'c'));
    });

    // ADR-0047 decision 3 — when reactions pile onto one message and the newest rows are all reaction
    // events, it still has to reach the last real message beneath them (guarding the blank-preview
    // regression).
    it('reaches the real message beneath even when reaction events fill the window', () => {
        const burst = Array.from({ length: 25 }, (_, i) =>
            chat(10 + i, '', { ownerId: 'u1', stereo: 'system', subType: 'reaction' })
        );
        expect(pickPreviewChat([chat(9, 'last message', { ownerId: 'u1', stereo: 'user' }), ...burst])?.content).toBe(
            'last message'
        );
    });

    it('system rows (mine and other peoples) cannot occupy the preview', () => {
        const picked = pickPreviewChat([
            chat(3, 'hello', { ownerId: 'u1', stereo: 'user' }),
            chat(4, 'u1 joined', { ownerId: 'u1', stereo: 'system' }),
        ]);
        expect(picked?.chatNo).toBe(3);
    });

    // The room's feed leaves replies to the thread page, so the preview does too.
    it('skips a thread reply and keeps the newest top-level message', () => {
        const top = chat(3, 'hello', { ownerId: 'u1', stereo: 'user' });
        const reply = chat(5, 'reply', { ownerId: 'u1', stereo: 'user', parentId: '3' });
        expect(pickPreviewChat([top, reply])).toEqual(top);
        expect(isPreviewableChat(reply)).toBe(false);
    });

    it('picks a thread reply as the newest activity while the preview stays on the top-level message', () => {
        const top = chat(3, 'hello', { ownerId: 'u1', stereo: 'user' });
        const reply = chat(5, 'reply', { ownerId: 'u1', stereo: 'user', parentId: '3' });
        expect(pickActivityChat([top, reply])).toEqual(reply);
        expect(pickPreviewChat([top, reply])).toEqual(top);
        expect(isActivityChat(reply)).toBe(true);
    });

    it('does not count a reaction event or a failed send as activity', () => {
        const top = chat(3, 'hello', { ownerId: 'u1', stereo: 'user' });
        const reaction = chat(5, '', { ownerId: 'u2', stereo: 'system', subType: 'reaction', parentId: '3' });
        const failed = chat(0, 'nope', { ownerId: 'u1', stereo: 'user', isFailed: true });
        expect(pickActivityChat([top, reaction, failed])).toEqual(top);
    });

    it('is undefined when the whole window is thread replies', () => {
        expect(pickPreviewChat([chat(5, 'reply', { ownerId: 'u1', stereo: 'user', parentId: '3' })])).toBeUndefined();
    });

    it('undefined when the whole window is system rows', () => {
        expect(pickPreviewChat([chat(1, 'me joined', { ownerId: 'me', stereo: 'system' })])).toBeUndefined();
    });

    it('a pending row (chatNo 0) wins as newest, and a failed send is excluded', () => {
        const pending = chat(0, 'sending', { isPending: true });
        expect(pickPreviewChat([chat(9, 'committed'), pending])).toEqual(pending);

        const failed = chat(0, 'failed', { isFailed: true });
        expect(pickPreviewChat([chat(9, 'committed'), failed])?.content).toBe('committed');
    });

    it('a tombstone (hidden) is still a preview — the row renders as the "deleted message" text', () => {
        const tombstone = chat(9, 'deleted body', { hidden: true });
        expect(isPreviewableChat(tombstone)).toBe(true);
        expect(pickPreviewChat([chat(8, 'earlier'), tombstone])).toEqual(tombstone);
    });
});

describe('compareByChatNo', () => {
    it('chatNo 0 (pending) is newer than any committed row, and pending rows order by createdAt', () => {
        expect(compareByChatNo(chat(9, 'a'), chat(0, 'p'))).toBeLessThan(0);
        expect(compareByChatNo(chat(0, 'p1', { createdAt: 100 }), chat(0, 'p2', { createdAt: 200 }))).toBeLessThan(0);
    });
});

// A revision notice is what the server writes each time a message is edited or deleted. It says
// which message changed; it is not a message, and in the feed it would be an empty notice line.
describe('isEventChat / isFeedVisible — revision notices', () => {
    const revision = (fields: Partial<DomainChat> = {}) =>
        chat(12, '', { stereo: 'system', subType: 'edit', edit$: { action: 'update', chatId: 'C1:4' }, ...fields });

    it('counts a revision and a reaction as events, and nothing else', () => {
        expect(isEventChat(revision())).toBe(true);
        expect(isEventChat(chat(3, '', { stereo: 'system', subType: 'reaction' }))).toBe(true);
        expect(isEventChat(chat(3, '', { stereo: 'system', subType: 'join' }))).toBe(false);
        expect(isEventChat(chat(3, 'hi'))).toBe(false);
    });

    it('keeps a revision out of the feed, whoever made it and whatever it did', () => {
        expect(isFeedVisible(revision())).toBe(false);
        expect(isFeedVisible(revision({ edit$: { action: 'delete', chatId: 'C1:4' } }))).toBe(false);
        expect(isFeedVisible(revision({ ownerId: 'someone-else' }))).toBe(false);
    });

    it('still keeps a join/leave notice in the feed', () => {
        expect(isFeedVisible(chat(3, '', { stereo: 'system', subType: 'join' }))).toBe(true);
    });

    it('lets a revision be neither the preview nor activity', () => {
        expect(isPreviewableChat(revision())).toBe(false);
        expect(pickPreviewChat([chat(11, 'real'), revision()])?.content).toBe('real');
    });
});
