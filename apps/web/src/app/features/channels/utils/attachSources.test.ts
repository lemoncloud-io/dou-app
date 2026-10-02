import { albumAccept, DOCUMENT_ACCEPT, isAppleTouchWebKit, rejectionKey } from './attachSources';

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

    it('offers documents only, by type and extension, from files', () => {
        expect(DOCUMENT_ACCEPT.split(',')).toEqual(expect.arrayContaining(['application/pdf', '.hwp', '.hwpx']));
        expect(DOCUMENT_ACCEPT).not.toContain('image/');
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
