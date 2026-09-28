import {
    isPendingUploadSlot,
    parseUploadCompleteResult,
    parseUploadStartResult,
    UploadResponseShapeError,
} from './types';

const SIGNED_URL = 'https://bucket.s3.amazonaws.com/o?X-Amz-Signature=secret';

describe('parseUploadStartResult', () => {
    it('keeps only the mirrored fields of a well-formed answer', () => {
        const result = parseUploadStartResult({
            list: [
                {
                    upload: { id: 'up-1', status: 'pending', name: 'a.jpg', contentSize: 10 },
                    transfer: {
                        kind: 'presigned-put',
                        method: 'PUT',
                        url: SIGNED_URL,
                        headers: { 'content-type': 'image/jpeg' },
                        maxBytes: 99,
                        expiresAt: 1,
                    },
                },
            ],
        });

        expect(result).toEqual({
            list: [
                {
                    upload: { id: 'up-1', status: 'pending' },
                    transfer: { url: SIGNED_URL, headers: { 'content-type': 'image/jpeg' } },
                },
            ],
        });
    });

    it('accepts a slot rejected at start, which has no id and no transfer', () => {
        expect(parseUploadStartResult({ list: [{ upload: { status: 'failed', error: 'too large' } }] })).toEqual({
            list: [{ upload: { status: 'failed', error: 'too large' } }],
        });
    });

    it('accepts an already stored slot, which has nothing to send', () => {
        expect(parseUploadStartResult({ list: [{ upload: { id: 'up-1', status: 'stored' } }] })).toEqual({
            list: [{ upload: { id: 'up-1', status: 'stored' } }],
        });
    });

    it.each([
        ['no answer at all', undefined, 'list'],
        ['no list', {}, 'list'],
        ['a ticket that is not an object', { list: ['x'] }, 'list[0]'],
        ['a ticket without an upload', { list: [{}] }, 'list[0].upload'],
        ['an unknown status', { list: [{ upload: { id: 'up-1', status: 'uploading' } }] }, 'list[0].upload.status'],
        ['a pending upload without an id', { list: [{ upload: { status: 'pending' } }] }, 'list[0].upload.id'],
        [
            'an inline transfer, which has no destination',
            { list: [{ upload: { id: 'up-1', status: 'pending' }, transfer: { kind: 'inline', maxBytes: 9 } }] },
            'list[0].transfer',
        ],
        [
            'a header that is not a string',
            {
                list: [
                    {
                        upload: { id: 'up-1', status: 'pending' },
                        thumbnailTransfer: { url: SIGNED_URL, headers: { 'x-amz-meta': 3 } },
                    },
                ],
            },
            'list[0].thumbnailTransfer.headers',
        ],
    ])('rejects %s, naming the path', (_label, answer, path) => {
        expect(() => parseUploadStartResult(answer)).toThrow(new UploadResponseShapeError('start', path));
    });

    // The error message travels to logs and crash reports; a malformed ticket still holds a signed URL.
    it('never puts a response value into the error message', () => {
        const answer = { list: [{ upload: { id: 'up-1', status: 'pending' }, transfer: { url: SIGNED_URL } }] };

        expect(() => parseUploadStartResult(answer)).toThrow(UploadResponseShapeError);
        try {
            parseUploadStartResult(answer);
        } catch (error) {
            expect(String((error as Error).message)).not.toContain('amazonaws');
        }
    });
});

describe('parseUploadCompleteResult', () => {
    it('keeps id, status and error only', () => {
        expect(
            parseUploadCompleteResult({
                list: [
                    { id: 'up-1', status: 'stored', url: SIGNED_URL, thumbnail: { url: SIGNED_URL } },
                    { id: 'up-2', status: 'failed', error: 'checksum' },
                ],
            })
        ).toEqual({
            list: [
                { id: 'up-1', status: 'stored' },
                { id: 'up-2', status: 'failed', error: 'checksum' },
            ],
        });
    });

    it('rejects an entry without the id it settles, even a failed one', () => {
        expect(() => parseUploadCompleteResult({ list: [{ status: 'failed' }] })).toThrow(
            new UploadResponseShapeError('complete', 'list[0].id')
        );
    });

    it('rejects an answer without a list', () => {
        expect(() => parseUploadCompleteResult({ ok: true })).toThrow(new UploadResponseShapeError('complete', 'list'));
    });
});

describe('isPendingUploadSlot', () => {
    it('is true for a pending slot and false for a server upload', () => {
        expect(isPendingUploadSlot({ localStatus: 'failed', localThumbUrl: 'blob:a' })).toBe(true);
        expect(isPendingUploadSlot({ id: 'up-1', status: 'failed', error: 'checksum' })).toBe(false);
    });

    it.each([null, undefined, 'localStatus', 3])('is false for %p', value => {
        expect(isPendingUploadSlot(value)).toBe(false);
    });
});
