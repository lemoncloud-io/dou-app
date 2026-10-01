import { canOpenMessageActions, hasMessageText, shareableFile } from './messageActions';

const upload$$ = [{ id: 'u1', status: 'stored', orgUrl: 'https://s3/1' }] as never;

describe('hasMessageText', () => {
    it('is true for a message with text', () => {
        expect(hasMessageText({ content: 'hello' })).toBe(true);
    });

    it('is false for an empty or whitespace-only body', () => {
        expect(hasMessageText({ content: '' })).toBe(false);
        expect(hasMessageText({ content: '  \n' })).toBe(false);
        expect(hasMessageText({})).toBe(false);
    });
});

describe('canOpenMessageActions', () => {
    it('opens for text, persisted or not — copy is always there', () => {
        expect(canOpenMessageActions({ content: 'hello', chatNo: 3 })).toBe(true);
        expect(canOpenMessageActions({ content: 'hello' })).toBe(true);
    });

    it('opens for a persisted image-only message', () => {
        expect(canOpenMessageActions({ content: '', upload$$, chatNo: 3 })).toBe(true);
    });

    it('stays shut for an image-only message still on its way, which has nothing to offer yet', () => {
        expect(canOpenMessageActions({ content: '', upload$$ })).toBe(false);
        expect(canOpenMessageActions({ content: '', upload$$, chatNo: 0 })).toBe(false);
    });

    it('stays shut for a message with neither text nor images', () => {
        expect(canOpenMessageActions({ content: '', chatNo: 3 })).toBe(false);
    });

    it('stays shut for a deleted message, whatever it carried', () => {
        expect(canOpenMessageActions({ content: 'hello', chatNo: 3, hidden: true })).toBe(false);
        expect(canOpenMessageActions({ content: '', upload$$, chatNo: 3, hidden: true })).toBe(false);
    });
});

describe('shareableFile', () => {
    const docs = [
        { id: 'p1', status: 'stored', orgUrl: 'https://s3/p1', contentType: 'image/jpeg' },
        {
            id: 'd1',
            status: 'stored',
            orgUrl: 'https://s3/d1',
            contentType: 'application/pdf',
            stereo: 'file',
            name: 'a.pdf',
        },
        {
            id: 'd2',
            status: 'stored',
            orgUrl: 'https://s3/d2',
            contentType: 'application/pdf',
            stereo: 'file',
            name: 'b.pdf',
        },
    ] as never;

    it('is the first stored document of a persisted message, keyed like its card', () => {
        expect(shareableFile({ cid: 'c', upload$$: docs, chatNo: 3 })).toEqual(
            expect.objectContaining({ key: 'c/d1', uploadId: 'd1', url: 'https://s3/d1', name: 'a.pdf' })
        );
    });

    it('skips a document the server failed to store', () => {
        const failedFirst = [
            { id: 'd1', status: 'failed', orgUrl: 'https://s3/d1', contentType: 'application/pdf', stereo: 'file' },
            { id: 'd2', status: 'stored', orgUrl: 'https://s3/d2', contentType: 'application/pdf', stereo: 'file' },
        ] as never;
        expect(shareableFile({ cid: 'c', upload$$: failedFirst, chatNo: 3 })?.uploadId).toBe('d2');
    });

    it('is nothing for photos only, a message on its way, or a deleted one', () => {
        expect(shareableFile({ cid: 'c', upload$$, chatNo: 3 })).toBeUndefined();
        expect(shareableFile({ cid: 'c', upload$$: docs, chatNo: 0 })).toBeUndefined();
        expect(shareableFile({ cid: 'c', upload$$: docs, chatNo: 3, hidden: true })).toBeUndefined();
    });
});
