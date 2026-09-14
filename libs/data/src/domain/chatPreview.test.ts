import type { DomainChat } from './models';
import { compareByChatNo, isPreviewableChat, pickPreviewChat } from './chatPreview';

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

    it('system rows (mine and other peoples) and thread replies cannot occupy the preview', () => {
        const picked = pickPreviewChat([
            chat(3, 'hello', { ownerId: 'u1', stereo: 'user' }),
            chat(4, 'u1 joined', { ownerId: 'u1', stereo: 'system' }),
            chat(5, 'reply', { ownerId: 'u1', stereo: 'user', parentId: '3' }),
        ]);
        expect(picked?.chatNo).toBe(3);
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
