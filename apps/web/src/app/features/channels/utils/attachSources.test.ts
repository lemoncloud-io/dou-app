import { CHAT_ATTACHMENT_ACCEPT } from '@chatic/data';

import { albumAccept, documentAccept, isAppleTouchWebKit, rejectionKey } from './attachSources';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile';

describe('isAppleTouchWebKit', () => {
    it('knows an iPhone, and an iPad asking for the desktop site by its touch screen', () => {
        expect(isAppleTouchWebKit(IPHONE, 5)).toBe(true);
        expect(isAppleTouchWebKit(IPAD_DESKTOP, 5)).toBe(true);
    });

    it('takes a Mac without touch and an Android phone for what they are', () => {
        expect(isAppleTouchWebKit(IPAD_DESKTOP, 0)).toBe(false);
        expect(isAppleTouchWebKit(ANDROID, 5)).toBe(false);
    });
});

describe('page input accept lists', () => {
    it('offers videos from the album except on iOS WebKit, which would hand them over as QuickTime', () => {
        expect(albumAccept(false).split(',')).toEqual(expect.arrayContaining(['image/png', 'video/mp4']));
        expect(albumAccept(true).split(',')).not.toContain('video/mp4');
        expect(albumAccept(true).split(',')).toContain('image/jpeg');
    });

    it('offers the document formats, by type and extension, and no image type from files', () => {
        expect(documentAccept(true).split(',')).toEqual(expect.arrayContaining(['application/pdf', '.hwp', '.hwpx']));
        expect(documentAccept(true)).not.toContain('image/');
    });

    it('also takes the generic type from files, the only one iOS WebKit lets HWP and HWPX through under', () => {
        expect(documentAccept(true).split(',')).toContain('application/octet-stream');
    });

    it('offers every server format from files outside iOS WebKit, and nothing past them but the generic type', () => {
        const accept = documentAccept(false).split(',');
        expect(accept).toEqual(
            expect.arrayContaining(['image/png', '.webp', 'video/mp4', '.mp4', 'application/pdf', '.hwpx'])
        );
        expect(accept).toEqual([...CHAT_ATTACHMENT_ACCEPT.split(','), 'application/octet-stream']);
        expect(accept.some(type => type.includes('*'))).toBe(false);
    });

    it('keeps the documents-only list on iOS WebKit, so its input still opens Files directly', () => {
        expect(documentAccept(true)).not.toMatch(/image\/|video\//);
    });
});

describe('rejectionKey', () => {
    const named = (name: string, type: string) => new File(['x'], name, { type });

    it('names the kind whose limit was passed', () => {
        expect(rejectionKey({ reason: 'too-large', kind: 'video' }, named('a.mp4', 'video/mp4'))).toBe(
            'chat.attach.rejected.too-large.video'
        );
    });

    it('names an unknown format by what it looked like', () => {
        expect(rejectionKey({ reason: 'unsupported' }, named('a.heic', 'image/heic'))).toBe(
            'chat.attach.rejected.unsupportedImage'
        );
        expect(rejectionKey({ reason: 'unsupported' }, named('a.mov', 'video/quicktime'))).toBe(
            'chat.attach.rejected.unsupportedVideo'
        );
        expect(rejectionKey({ reason: 'unsupported' }, named('a.zip', 'application/zip'))).toBe(
            'chat.attach.rejected.unsupported'
        );
    });

    it('passes the other reasons through', () => {
        expect(rejectionKey({ reason: 'limit' }, named('a.jpg', 'image/jpeg'))).toBe('chat.attach.rejected.limit');
        expect(rejectionKey({ reason: 'duplicate' }, named('a.jpg', 'image/jpeg'))).toBe(
            'chat.attach.rejected.duplicate'
        );
    });
});
