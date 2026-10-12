import type { ChatAttachmentSource } from '@chatic/data';

import {
    CHAT_SEND_MEDIA_SAMPLES_PER_MINUTE,
    createMediaSendTracer,
    mediaCountBucket,
    mediaKindOf,
    mediaSizeBucket,
} from './mediaSendTrace';

const file = (name: string, type: string, size = 1024): ChatAttachmentSource =>
    new File([new Uint8Array(size)], name, { type });
const IMAGE = file('a.jpg', 'image/jpeg', 2 * 1024 * 1024);
const VIDEO = file('b.mp4', 'video/mp4', 20 * 1024 * 1024);
const PDF = file('c.pdf', 'application/pdf', 100 * 1024);

describe('media send buckets', () => {
    it('names one kind when every file is that kind, else mixed', () => {
        expect(mediaKindOf([IMAGE, IMAGE])).toBe('image');
        expect(mediaKindOf([VIDEO])).toBe('video');
        expect(mediaKindOf([PDF])).toBe('file');
        expect(mediaKindOf([IMAGE, VIDEO])).toBe('mixed');
    });

    it('buckets the count and the picked size', () => {
        expect([1, 2, 5, 6, 10].map(mediaCountBucket)).toEqual(['1', '2-5', '2-5', '6+', '6+']);
        expect([500 * 1024, 5 * 1024 * 1024, 20 * 1024 * 1024, 300 * 1024 * 1024].map(mediaSizeBucket)).toEqual([
            '<1mb',
            '1-10mb',
            '10-50mb',
            '50mb+',
        ]);
    });
});

describe('createMediaSendTracer', () => {
    let clock = 0;
    let hides = 0;
    const record = jest.fn();
    const tracer = (hidden = () => false) =>
        createMediaSendTracer({
            now: () => clock,
            clock: () => clock,
            record,
            isHidden: hidden,
            hideCount: () => hides,
        });

    beforeEach(() => {
        clock = 0;
        hides = 0;
        record.mockClear();
    });

    it('records a sample with the phases reached, by kind, count, size, thread and outcome', () => {
        const timing = tracer()({ files: [IMAGE, VIDEO], reply: true, retry: false });
        clock = 40;
        timing.mark('row');
        clock = 900;
        timing.mark('bytes_sent');
        timing.mark('bytes_sent');
        clock = 1200;
        timing.end('partial');

        expect(record).toHaveBeenCalledWith('chat_send_media', {
            attributes: { kind: 'mixed', count: '2-5', size: '10-50mb', thread: 'reply', outcome: 'partial' },
            metrics: { value_ms: 1200, bytes_kb: 22 * 1024, files: 2, retry: 0, row_ms: 40, bytes_sent_ms: 900 },
        });
    });

    it('records once, and marks nothing after the end', () => {
        const timing = tracer()({ files: [PDF], reply: false, retry: true });

        timing.end('error');
        timing.mark('sent');
        timing.end('ok');

        expect(record).toHaveBeenCalledTimes(1);
        expect(record.mock.calls[0][1]).toMatchObject({ attributes: { outcome: 'error' }, metrics: { retry: 1 } });
    });

    it('drops a send the page was hidden during, and times none from a hidden page', () => {
        const timing = tracer()({ files: [IMAGE], reply: false, retry: false });
        hides += 1;
        timing.end('ok');

        tracer(() => true)({ files: [IMAGE], reply: false, retry: false }).end('ok');

        expect(record).not.toHaveBeenCalled();
    });

    it('caps the sends a minute, and starts again in the next minute', () => {
        const begin = tracer();
        for (let i = 0; i < CHAT_SEND_MEDIA_SAMPLES_PER_MINUTE + 2; i += 1) {
            begin({ files: [IMAGE], reply: false, retry: false }).end('ok');
        }
        expect(record).toHaveBeenCalledTimes(CHAT_SEND_MEDIA_SAMPLES_PER_MINUTE);

        clock = 60_000;
        begin({ files: [IMAGE], reply: false, retry: false }).end('ok');
        expect(record).toHaveBeenCalledTimes(CHAT_SEND_MEDIA_SAMPLES_PER_MINUTE + 1);
    });
});
