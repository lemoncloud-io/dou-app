import { lastChatPreview } from './lastChatPreview';

// Echoes the key, with the count when one is passed, so the chosen key and count are both assertable.
// The thread and sender keys render their real shape, so the composed line reads as the row does.
const t = (key: string, options?: { count?: number; name?: string; text?: string }) => {
    if (key === 'chat.preview.thread') return `[thread] ${options?.text}`;
    if (key === 'chat.preview.sender') return `${options?.name} : ${options?.text}`;
    return options?.count !== undefined ? `${key}:${options.count}` : key;
};

describe('lastChatPreview', () => {
    it('answers nothing for a room with no last message', () => {
        expect(lastChatPreview(undefined, t)).toBe('');
        expect(lastChatPreview(null, t)).toBe('');
    });

    it('prints the text flattened, markup dropped', () => {
        expect(lastChatPreview({ content: '배포는 `yarn deploy` 로, [가이드](https://example.com/a) 참고' }, t)).toBe(
            '배포는 yarn deploy 로, 가이드 참고'
        );
    });

    // A soft delete keeps the body on the row, so the tombstone has to win over the text.
    it('prints the deleted-message phrase for a tombstone, never its kept body', () => {
        expect(lastChatPreview({ content: '지워진 원문', hidden: true }, t)).toBe('chat.room.deletedMessage');
    });

    // The server models `hidden` as 0/1; a 1 on the wire is a delete too.
    it('reads hidden for truthiness, so a 1 from the wire is a tombstone', () => {
        expect(lastChatPreview({ content: '지워진 원문', hidden: 1 as unknown as boolean }, t)).toBe(
            'chat.room.deletedMessage'
        );
    });

    it('prints the tombstone for a deleted attachment-only message, not the attachment noun', () => {
        expect(lastChatPreview({ content: '', uploadIds: ['u1'], hidden: true }, t)).toBe('chat.room.deletedMessage');
    });

    it('names a lone attachment by its one-item key', () => {
        expect(lastChatPreview({ content: '', uploadIds: ['u1'] }, t)).toBe('chat.attach.preview:1');
    });

    it('counts several attachments of one kind', () => {
        expect(lastChatPreview({ content: '', uploadIds: ['u1', 'u2', 'u3'] }, t)).toBe('chat.attach.previewCount:3');
    });

    it('names the kind the sent slots carry, and uses the count form for mixed kinds', () => {
        const video = { id: 'v', stereo: 'video' };
        const file = { id: 'f', stereo: 'file' };
        expect(lastChatPreview({ content: '', upload$$: [video] as any }, t)).toBe('chat.attach.previewVideo:1');
        expect(lastChatPreview({ content: '', upload$$: [video, file] as any }, t)).toBe(
            'chat.attach.previewMixedCount:2'
        );
    });

    it('prints the text when a message carries both text and attachments', () => {
        expect(lastChatPreview({ content: '보냈어요', uploadIds: ['u1'] }, t)).toBe('보냈어요');
    });

    it('answers nothing for a message with neither text nor attachments', () => {
        expect(lastChatPreview({ content: '' }, t)).toBe('');
    });

    describe('a thread reply and a sender', () => {
        it('marks a thread reply as one', () => {
            expect(lastChatPreview({ content: 'reply', parentId: 'ch:3' }, t)).toBe('[thread] reply');
        });

        it('leads a group line with its sender', () => {
            expect(lastChatPreview({ content: 'hello' }, t, 'Raine')).toBe('Raine : hello');
        });

        it('puts the thread mark before the sender', () => {
            expect(lastChatPreview({ content: 'reply', parentId: 'ch:3' }, t, 'Raine')).toBe('[thread] Raine : reply');
        });

        it('prints the line alone when the sender did not resolve', () => {
            expect(lastChatPreview({ content: 'hello' }, t, '')).toBe('hello');
            expect(lastChatPreview({ content: 'hello' }, t, '   ')).toBe('hello');
        });

        it('names the sender of an attachment-only message and of a tombstone', () => {
            expect(lastChatPreview({ content: '', uploadIds: ['u1'] }, t, 'Raine')).toBe(
                'Raine : chat.attach.preview:1'
            );
            expect(lastChatPreview({ content: 'x', hidden: true }, t, 'Raine')).toBe(
                'Raine : chat.room.deletedMessage'
            );
        });

        it('prints nothing, not a bare sender or mark, when there is no line', () => {
            expect(lastChatPreview({ content: '', parentId: 'ch:3' }, t, 'Raine')).toBe('');
        });
    });
});
