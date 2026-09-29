import { isOpenableUrl, isTrustedBridgeUrl } from './urlTrust';

jest.mock('react-native-config', () => ({ default: { VITE_ENV: 'DEV' } }));
// deeplinkUtils' invite decoding pulls in the shared UI package, which this pure check never uses.
jest.mock('@chatic/shared', () => ({ decodeInviteLink: jest.fn(), isEncodedInviteUrl: jest.fn() }));

describe('isTrustedBridgeUrl', () => {
    const base = 'http://localhost:5003';

    it('trusts a page on the origin the WebView was pointed at', () => {
        expect(isTrustedBridgeUrl('http://localhost:5003/channels/1/room', base)).toBe(true);
    });

    // Current Android reports the sender's bare origin, with no path or trailing slash.
    it('trusts the bare origin form', () => {
        expect(isTrustedBridgeUrl('http://localhost:5003', base)).toBe(true);
    });

    it("trusts the app's own web hosts a base URL may redirect to", () => {
        expect(isTrustedBridgeUrl('https://app.chatic.io/home', 'https://chatic.io')).toBe(true);
        expect(isTrustedBridgeUrl('https://app-dev.chatic.io/', 'https://chatic.io')).toBe(true);
    });

    it('refuses any other origin', () => {
        expect(isTrustedBridgeUrl('https://evil.example/', base)).toBe(false);
        expect(isTrustedBridgeUrl('http://localhost:5004/', base)).toBe(false);
        expect(isTrustedBridgeUrl('http://app.chatic.io/', base)).toBe(false);
    });

    it('reads the host after userinfo, not before it', () => {
        expect(isTrustedBridgeUrl('https://app.chatic.io@evil.example/', base)).toBe(false);
    });

    it('refuses a page with no URL or a non-web one', () => {
        expect(isTrustedBridgeUrl(undefined, base)).toBe(false);
        expect(isTrustedBridgeUrl('about:blank', base)).toBe(false);
        expect(isTrustedBridgeUrl('file:///data/index.html', base)).toBe(false);
    });

    it('compares hosts case-insensitively', () => {
        expect(isTrustedBridgeUrl('HTTPS://APP.CHATIC.IO/', base)).toBe(true);
    });
});

describe('isOpenableUrl', () => {
    it.each(['https://github.com/x', 'http://a.b', 'mailto:a@b.c', 'tel:+821012345678', 'sms:+821012345678'])(
        'opens %s',
        url => expect(isOpenableUrl(url)).toBe(true)
    );

    // The debug deeplink screen opens the other channel's scheme on purpose.
    it.each(['chatic-dev://push?x=1', 'chatic://s?code=x'])('opens the app scheme %s', url =>
        expect(isOpenableUrl(url)).toBe(true)
    );

    it('refuses a payload that is not a string', () => {
        expect(isOpenableUrl(undefined)).toBe(false);
        expect(isOpenableUrl(42)).toBe(false);
    });

    it.each([
        'intent://scan/#Intent;scheme=zxing;end',
        // eslint-disable-next-line no-script-url -- the refused input under test, never executed
        'javascript:alert(1)',
        'file:///etc/hosts',
        'not a url',
        '',
    ])('refuses %s', url => expect(isOpenableUrl(url)).toBe(false));
});
