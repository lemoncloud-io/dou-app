import {
    CUSTOM_UI_ORIGIN,
    CUSTOM_UI_URL,
    initWebUrl,
    isCustomUiActive,
    isCustomUiUrl,
    isTrustedUrl,
    resolveWebUrl,
    safeOrigin,
    setCustomUiActive,
} from './webUrl';

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

describe('custom UI origin', () => {
    beforeEach(() => initWebUrl(REMOTE));

    it('gives the custom scheme a comparable origin', () => {
        // Node's URL leaves non-special schemes with an opaque origin ("null"), so the
        // shell has to assemble this one itself or it could never match.
        expect(safeOrigin(`${CUSTOM_UI_ORIGIN}/assets/app.js`)).toBe(CUSTOM_UI_ORIGIN);
    });

    it('does not hand an origin to other opaque-origin URLs', () => {
        expect(safeOrigin('data:text/html,x')).toBeNull();
        expect(safeOrigin('chatic-local://somewhere-else/x')).toBeNull();
    });

    it('is neither loaded nor trusted while inactive', () => {
        expect(resolveWebUrl()).toBe(REMOTE);
        expect(isTrustedUrl(`${CUSTOM_UI_ORIGIN}/`)).toBe(false);
    });

    it('becomes the loaded URL and a trusted origin once activated', () => {
        setCustomUiActive(true);
        expect(resolveWebUrl()).toBe(CUSTOM_UI_URL);
        expect(isTrustedUrl(`${CUSTOM_UI_ORIGIN}/index.html`)).toBe(true);
    });

    it('keeps trusting the remote origin while active, so a fallback load still works', () => {
        setCustomUiActive(true);
        expect(isTrustedUrl(`${REMOTE}/chat`)).toBe(true);
    });

    it('drops the origin from the trusted set on deactivate', () => {
        setCustomUiActive(true);
        setCustomUiActive(false);
        expect(resolveWebUrl()).toBe(REMOTE);
        expect(isTrustedUrl(`${CUSTOM_UI_ORIGIN}/`)).toBe(false);
    });

    it('is reset by initWebUrl, so a re-init never inherits a stale activation', () => {
        setCustomUiActive(true);
        initWebUrl(REMOTE);
        expect(resolveWebUrl()).toBe(REMOTE);
        expect(isTrustedUrl(`${CUSTOM_UI_ORIGIN}/`)).toBe(false);
    });

    it('reports whether the shell is on a bundle, so failures can fall back to the remote web', () => {
        expect(isCustomUiActive()).toBe(false);
        setCustomUiActive(true);
        expect(isCustomUiActive()).toBe(true);
        setCustomUiActive(false);
        expect(isCustomUiActive()).toBe(false);
    });

    it('identifies a failing load as the bundle regardless of activation state', () => {
        // did-fail-load reports the URL that failed; the answer must not depend on whether
        // the shell has already been switched off the bundle.
        expect(isCustomUiUrl(`${CUSTOM_UI_ORIGIN}/index.html`)).toBe(true);
        expect(isCustomUiUrl(`${REMOTE}/chat`)).toBe(false);
        expect(isCustomUiUrl('data:text/html,x')).toBe(false);
        expect(isCustomUiUrl(undefined)).toBe(false);
    });
});
