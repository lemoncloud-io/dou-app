import { grantsPermission } from './permissions';
import { initWebUrl } from './webUrl';

const REMOTE = 'https://desktop.chatic.io';

describe('grantsPermission', () => {
    beforeEach(() => initWebUrl(REMOTE));

    it('grants fullscreen to the app page, so a video fullscreen button works', () => {
        expect(grantsPermission('fullscreen', `${REMOTE}/chat/c1`)).toBe(true);
    });

    it('denies fullscreen to a page from another origin', () => {
        expect(grantsPermission('fullscreen', 'https://evil.example.com/')).toBe(false);
        expect(grantsPermission('fullscreen', undefined)).toBe(false);
    });

    it('grants notifications and clipboard writes', () => {
        expect(grantsPermission('notifications', `${REMOTE}/`)).toBe(true);
        expect(grantsPermission('clipboard-sanitized-write', `${REMOTE}/`)).toBe(true);
    });

    it('denies what the app does not use, even to the app page', () => {
        expect(grantsPermission('media', `${REMOTE}/`)).toBe(false);
        expect(grantsPermission('geolocation', `${REMOTE}/`)).toBe(false);
    });
});
