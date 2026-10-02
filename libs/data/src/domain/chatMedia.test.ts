import type { DomainChat } from './models';
import { chatMediaItems } from './chatMedia';

type Slot = NonNullable<DomainChat['upload$$']>[number];

const server = (fields: Record<string, unknown>): Slot => ({ status: 'stored', ...fields }) as Slot;

describe('chatMediaItems', () => {
    it('keeps photos and videos in sent order as media and moves documents out to files', () => {
        const { media, files, mediaSlots, fileSlots } = chatMediaItems('c1', [
            server({ id: 'u1', stereo: 'image', orgUrl: 'https://s/1', thumbUrl: 'https://s/1t' }),
            server({
                id: 'u2',
                stereo: 'file',
                name: 'quote.pdf',
                contentSize: 2048,
                contentType: 'application/pdf',
                orgUrl: 'https://s/2',
            }),
            server({ id: 'u3', stereo: 'image', orgUrl: 'https://s/3' }),
            server({
                id: 'u4',
                stereo: 'video',
                name: 'clip.mp4',
                contentSize: 9,
                orgUrl: 'https://s/4',
                thumbUrl: 'https://s/4p',
            }),
        ]);

        expect(media).toEqual([
            { key: 'c1/u1', kind: 'image', src: 'https://s/1', preview: 'https://s/1t', state: 'ready' },
            { key: 'c1/u3', kind: 'image', src: 'https://s/3', preview: 'https://s/3', state: 'ready' },
            {
                key: 'c1/u4',
                kind: 'video',
                src: 'https://s/4',
                preview: 'https://s/4p',
                name: 'clip.mp4',
                size: 9,
                state: 'ready',
            },
        ]);
        expect(files).toEqual([
            {
                key: 'c1/u2',
                uploadId: 'u2',
                name: 'quote.pdf',
                size: 2048,
                contentType: 'application/pdf',
                url: 'https://s/2',
                state: 'ready',
            },
        ]);
        expect(mediaSlots).toEqual([0, 2, 3]);
        expect(fileSlots).toEqual([1]);
    });

    it('draws a video without a poster as nothing to preview, not as its original', () => {
        const { media } = chatMediaItems('c1', [server({ id: 'v', stereo: 'video', orgUrl: 'https://s/v' })]);

        expect(media[0]).toEqual({ key: 'c1/v', kind: 'video', src: 'https://s/v', state: 'ready' });
    });

    it('marks a failed, erroring or address-less upload broken but keeps its place', () => {
        const { media, files } = chatMediaItems('c1', [
            server({ id: 'a', stereo: 'image', status: 'failed' }),
            server({ id: 'b', stereo: 'video', error: '415 UNSUPPORTED', orgUrl: 'https://s/b' }),
            server({ id: 'c', stereo: 'file', name: 'x.pdf' }),
        ]);

        expect(media.map(item => item.state)).toEqual(['broken', 'broken']);
        expect(files[0]).toMatchObject({ key: 'c1/c', state: 'broken' });
    });

    it('draws slots still being sent from what the page kept', () => {
        const { media, files } = chatMediaItems('c1', [
            { localStatus: 'sending', localThumbUrl: 'blob:1' },
            {
                localStatus: 'sending',
                localThumbUrl: '',
                localName: 'IMG.mp4',
                localContentType: 'video/mp4',
                localSize: 7,
            },
            {
                localStatus: 'failed',
                localThumbUrl: 'blob:3',
                localName: 'a.hwp',
                localContentType: 'application/x-hwp',
                localSize: 5,
            },
        ]);

        expect(media).toEqual([
            { key: 'local-0', kind: 'image', src: 'blob:1', preview: 'blob:1', state: 'sending' },
            { key: 'local-1', kind: 'video', name: 'IMG.mp4', size: 7, state: 'sending' },
        ]);
        expect(files).toEqual([
            { key: 'local-2', name: 'a.hwp', size: 5, contentType: 'application/x-hwp', state: 'failed' },
        ]);
    });

    it('takes an upload with no kind as an image, and leaves an unnamed document unnamed', () => {
        const { media, files } = chatMediaItems('c1', [
            server({ id: 'old', orgUrl: 'https://s/old' }),
            server({ id: 'f', stereo: 'file', orgUrl: 'https://s/f' }),
        ]);

        expect(media[0]).toMatchObject({ key: 'c1/old', kind: 'image' });
        expect(files[0]).not.toHaveProperty('name');
    });

    it('drops audio, which the server does not take, and answers nothing for no uploads', () => {
        expect(chatMediaItems('c1', [server({ id: 'a', stereo: 'audio', orgUrl: 'https://s/a' })]).media).toEqual([]);
        expect(chatMediaItems('c1', undefined)).toEqual({ media: [], files: [], mediaSlots: [], fileSlots: [] });
    });

    it('keys an upload with no id by its position', () => {
        expect(chatMediaItems('c1', [server({ stereo: 'image', orgUrl: 'https://s/x' })]).media[0].key).toBe(
            'c1/upload-0'
        );
    });
});
