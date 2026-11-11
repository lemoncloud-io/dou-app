import { createHmac } from 'crypto';

import { deriveSubWebViewUserKey } from './subWebViewUserKey';

const IOS_ID = '6E1C3B0A-9D2F-4C8E-B7A1-2F5D8E3C4B6A';
const ANDROID_ID = '9f2c4e6a8b1d3f57';

describe('deriveSubWebViewUserKey', () => {
    // A page's server keeps data under these, so a change to the derivation — the label, the
    // separator, the encoding, a library upgrade — must fail here before it orphans that data.
    it.each([
        [IOS_ID, 'https://foo.apps.chatic.io', '94625916a1487ec3cc48ac5765ee34f37cd31f5b7db20403d0fefc184344508f'],
        [
            ANDROID_ID,
            'https://foo.apps-dev.chatic.io',
            'be10e5b1722f79f4e5ac41960a636bea847e9cec87a1591bbf27d299f86f05c4',
        ],
    ])('derives the pinned key for %s on %s', (deviceId, origin, key) => {
        expect(deriveSubWebViewUserKey(deviceId, origin)).toBe(key);
    });

    it("is HMAC-SHA-256 keyed by the device id, as Node's crypto computes it", () => {
        const expected = createHmac('sha256', IOS_ID)
            .update('dou-sub-webview-user-key/v1\nhttps://bar.apps.chatic.io')
            .digest('hex');

        expect(deriveSubWebViewUserKey(IOS_ID, 'https://bar.apps.chatic.io')).toBe(expected);
    });

    it('gives the same device the same key on the same origin', () => {
        expect(deriveSubWebViewUserKey(IOS_ID, 'https://foo.apps.chatic.io')).toBe(
            deriveSubWebViewUserKey(IOS_ID, 'https://foo.apps.chatic.io')
        );
    });

    it('gives each origin, and each device, a key of its own', () => {
        const keys = [
            deriveSubWebViewUserKey(IOS_ID, 'https://foo.apps.chatic.io'),
            deriveSubWebViewUserKey(IOS_ID, 'https://bar.apps.chatic.io'),
            deriveSubWebViewUserKey(IOS_ID, 'https://foo.apps-dev.chatic.io'),
            deriveSubWebViewUserKey(ANDROID_ID, 'https://foo.apps.chatic.io'),
        ];

        expect(new Set(keys).size).toBe(keys.length);
    });

    it('answers 64 lower-case hex characters that do not contain the device id', () => {
        const key = deriveSubWebViewUserKey(ANDROID_ID, 'https://foo.apps.chatic.io');

        expect(key).toMatch(/^[0-9a-f]{64}$/);
        expect(key).not.toContain(ANDROID_ID);
    });
});
