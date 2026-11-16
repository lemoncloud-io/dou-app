import { describe, expect, it } from 'vitest';

// Initialises i18next, so the photo labels read as the reader sees them.
import '../../../i18n';

import { messagePreview, outgoingMessagePreview } from './messagePreview';

describe('messagePreview', () => {
    it('is the message text when there is any', () => {
        expect(messagePreview({ content: '**hi** there', uploadIds: ['u1'] })).toBe('hi there');
    });

    // A deleted message is quoted as deleted: a server that records deletes empties the body (a blank
    // line), and an older one keeps it (the words the author took back).
    it('reads as deleted for a deleted message, with or without its body', () => {
        expect(messagePreview({ content: '', hidden: true })).toBe('Message deleted');
        expect(messagePreview({ content: 'kept', hidden: true })).toBe('Message deleted');
        expect(messagePreview({ content: '', uploadIds: ['u1'], hidden: true })).toBe('Message deleted');
    });

    // An image message has no text; its OS banner read "Raine:" with nothing after it.
    it('names a single photo', () => {
        expect(messagePreview({ content: '', uploadIds: ['u1'] })).toBe('Photo');
    });

    it('counts several, from upload$$ when the row carries it', () => {
        expect(messagePreview({ content: '', upload$$: [{}, {}, {}] as never })).toBe('3 photos');
    });

    it('names a video or a file, and several of either', () => {
        const slots = (stereo: string, n: number) => Array.from({ length: n }, () => ({ id: 'u', stereo })) as never;
        expect(messagePreview({ content: '', upload$$: slots('video', 1) })).toBe('Video');
        expect(messagePreview({ content: '', upload$$: slots('video', 2) })).toBe('2 videos');
        expect(messagePreview({ content: '', upload$$: slots('file', 1) })).toBe('File');
        expect(messagePreview({ content: '', upload$$: slots('file', 3) })).toBe('3 files');
    });

    it('counts kinds that differ as attachments', () => {
        const upload$$ = [
            { id: 'a', stereo: 'image' },
            { id: 'b', stereo: 'file' },
        ] as never;
        expect(messagePreview({ content: '', upload$$ })).toBe('2 attachments');
    });

    it('names voice files, sent or on their way', () => {
        const memo = { id: 'a', stereo: 'audio', name: 'memo.m4a', contentType: 'audio/mp4' };
        expect(messagePreview({ content: '', upload$$: [memo] as never })).toBe('Voice file');
        const pending = [
            { localStatus: 'sending', localName: 'a.m4a', localContentType: 'audio/mp4' },
            { localStatus: 'sending', localName: 'b.mp3', localContentType: 'audio/mpeg' },
        ] as never;
        expect(messagePreview({ content: '', upload$$: pending })).toBe('2 voice files');
    });

    // A server that stores audio under `file` still says what the file is in its type and name.
    it('names a voice file stored as a document', () => {
        const upload$$ = [{ id: 'a', stereo: 'file', name: 'memo.m4a', contentType: 'audio/mp4' }] as never;
        expect(messagePreview({ content: '', upload$$ })).toBe('Voice file');
    });

    // The feed draws an upload it cannot tell is audio as a plain file card, so the line does not say voice.
    it('does not call an upload voice from its stored kind alone', () => {
        expect(messagePreview({ content: '', upload$$: [{ id: 'a', stereo: 'audio' }] as never })).toBe('Attachment');
    });

    it('counts voice beside other kinds as attachments', () => {
        const upload$$ = [
            { id: 'a', stereo: 'audio' },
            { id: 'b', stereo: 'file', name: 'plan.pdf', contentType: 'application/pdf' },
        ] as never;
        expect(messagePreview({ content: '', upload$$ })).toBe('2 attachments');
    });

    it('is empty when there is neither', () => {
        expect(messagePreview({ content: '' })).toBe('');
    });
});

describe('outgoingMessagePreview', () => {
    const file = (type: string) => new File(['x'], 'f', { type });

    it('names a voice file the way the sent message will', () => {
        expect(outgoingMessagePreview('', [file('audio/mpeg')])).toBe('Voice file');
        expect(outgoingMessagePreview('', [file('audio/mpeg')])).toBe(
            messagePreview({ content: '', upload$$: [{ stereo: 'audio', contentType: 'audio/mpeg' }] as never })
        );
        expect(outgoingMessagePreview('', [file('audio/mpeg'), file('audio/wav')])).toBe('2 voice files');
        expect(outgoingMessagePreview('', [file('audio/mpeg'), file('image/png')])).toBe('2 attachments');
    });

    it('is the text when the reply has any', () => {
        expect(outgoingMessagePreview('**hi**', [file('image/png')])).toBe('hi');
    });

    it('names what a files-only reply carries, by kind', () => {
        expect(outgoingMessagePreview('', [file('image/png')])).toBe('Photo');
        expect(outgoingMessagePreview('', [file('image/png'), file('image/jpeg')])).toBe('2 photos');
        expect(outgoingMessagePreview('', [file('image/png'), file('application/pdf')])).toBe(
            messagePreview({ content: '', upload$$: [{ stereo: 'image' }, { stereo: 'file' }] as never })
        );
    });

    it('is empty for an empty reply with nothing attached', () => {
        expect(outgoingMessagePreview('', [])).toBe('');
    });
});
