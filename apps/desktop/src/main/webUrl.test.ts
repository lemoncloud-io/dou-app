import { initWebUrl, isTrustedUrl, resolveWebUrl, safeOrigin } from './webUrl';

const REMOTE = 'https://desktop.chatic.io';

describe('safeOrigin', () => {
    it('returns the origin of a valid http(s) URL', () => {
        expect(safeOrigin('https://desktop.chatic.io/chat?x=1')).toBe('https://desktop.chatic.io');
    });

    it('returns null for an unparseable URL', () => {
        expect(safeOrigin('')).toBeNull();
        expect(safeOrigin('not a url')).toBeNull();
    });
});

describe('resolveWebUrl', () => {
    it('returns the remote URL the shell was initialised with', () => {
        initWebUrl(REMOTE);
        expect(resolveWebUrl()).toBe(REMOTE);
    });

    it('reflects re-initialisation (a recreated window must not see a stale URL)', () => {
        initWebUrl(REMOTE);
        initWebUrl('https://other.example.com');
        expect(resolveWebUrl()).toBe('https://other.example.com');
    });
});

describe('isTrustedUrl', () => {
    beforeEach(() => initWebUrl(REMOTE));

    it('trusts any path on the remote origin', () => {
        expect(isTrustedUrl(`${REMOTE}/`)).toBe(true);
        expect(isTrustedUrl(`${REMOTE}/chat/123?tab=thread`)).toBe(true);
    });

    it('rejects a different origin, including a lookalike host and a scheme downgrade', () => {
        expect(isTrustedUrl('https://evil.example.com/')).toBe(false);
        expect(isTrustedUrl('https://desktop.chatic.io.evil.com/')).toBe(false);
        expect(isTrustedUrl('http://desktop.chatic.io/')).toBe(false);
    });

    it('rejects undefined and unparseable input', () => {
        expect(isTrustedUrl(undefined)).toBe(false);
        expect(isTrustedUrl('')).toBe(false);
        expect(isTrustedUrl('not a url')).toBe(false);
    });

    it('rejects the data: URLs the shell paints for splash and error pages', () => {
        // The shell loads splash/error as data: URLs — did-fail-load and the IPC gate must
        // not treat those frames as the trusted web.
        expect(isTrustedUrl('data:text/html;charset=utf-8,%3Ch1%3Ehi%3C/h1%3E')).toBe(false);
    });

    it('trusts nothing when initialised with an unusable remote URL', () => {
        initWebUrl('');
        expect(isTrustedUrl(`${REMOTE}/`)).toBe(false);
        expect(isTrustedUrl('')).toBe(false);
    });
});
