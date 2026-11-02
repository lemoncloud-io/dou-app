import { SubWebViewService } from './SubWebViewService';
import { isAllowedSubWebViewUrl, SUB_WEBVIEW_DOMAINS } from './subWebViewAllowlist';
import type { SubWebViewEvent } from './types';

const DOMAINS = ['apps.chatic.io'];

const createLogger = () => ({ warn: jest.fn(), error: jest.fn() }) as any;

const createService = (logger = createLogger()) => {
    let n = 0;
    return new SubWebViewService(logger, DOMAINS, () => `view-${++n}`);
};

const record = (service: SubWebViewService) => {
    const events: SubWebViewEvent[] = [];
    service.subscribe(event => events.push(event));
    return events;
};

describe('isAllowedSubWebViewUrl', () => {
    it.each([
        ['a page on a subdomain, with any path', 'https://foo.apps.chatic.io/notice?id=1'],
        ['the root of a subdomain', 'https://foo.apps.chatic.io'],
        ['a dev subdomain', 'https://foo.apps-dev.chatic.io/'],
        ['mixed case', 'HTTPS://Foo.Apps.Chatic.IO/'],
    ])('allows %s', (_label, url) => {
        expect(isAllowedSubWebViewUrl(url)).toBe(true);
    });

    it.each([
        ['the domain itself, which is not a page', 'https://apps.chatic.io/'],
        ['two labels deep', 'https://a.b.apps.chatic.io/'],
        ['a lookalike domain', 'https://foo.apps.chatic.io.evil.example/'],
        ['a lookalike label', 'https://evilapps.chatic.io/'],
        ['http', 'http://foo.apps.chatic.io/'],
        ['a port', 'https://foo.apps.chatic.io:8443/'],
        ['userinfo before the host', 'https://user@foo.apps.chatic.io/'],
        ['userinfo that hides the real host', 'https://foo.apps.chatic.io@evil.example/'],
        // Android reads the backslash as a slash and loads evil.example.
        ['a backslash before userinfo', 'https://evil.example\\@foo.apps.chatic.io/'],
        ['whitespace', 'https://foo.apps.chatic.io/a b'],
        ['a control character', 'https://foo.apps.chatic.io/\u0000'],
        ['not a URL', 'foo.apps.chatic.io'],
        ['not a string', 42],
    ])('refuses %s', (_label, url) => {
        expect(isAllowedSubWebViewUrl(url)).toBe(false);
    });

    // The web app would boot a second copy of itself; the deep-link domain is trusted by the main
    // WebView's bridge. Neither may ever be a sub WebView page.
    it.each(['https://dou.chatic.io/', 'https://dou-dev.chatic.io/', 'https://app.chatic.io/', 'https://x.chatic.io/'])(
        'refuses %s, which is not under a sub WebView domain',
        url => {
            expect(isAllowedSubWebViewUrl(url)).toBe(false);
        }
    );

    it('is a subtree of its own, not the whole of chatic.io', () => {
        expect(SUB_WEBVIEW_DOMAINS).toEqual(['apps.chatic.io', 'apps-dev.chatic.io']);
    });
});

describe('SubWebViewService', () => {
    describe('open', () => {
        it('records the view and reports it opened', () => {
            const service = createService();
            const events = record(service);

            const result = service.open({ url: 'https://foo.apps.chatic.io/a', title: 'Notice' });

            const view = { viewId: 'view-1', url: 'https://foo.apps.chatic.io/a', title: 'Notice' };
            expect(result).toEqual({ ok: true, view });
            expect(service.current()).toEqual(view);
            expect(events).toEqual([{ type: 'opened', view }]);
        });

        it.each([
            ['a missing url', { url: undefined }],
            ['an http url', { url: 'http://app.chatic.io/' }],
            ['a non-string title', { url: 'https://foo.apps.chatic.io/', title: 1 }],
        ])('answers INVALID for %s', (_label, request) => {
            const service = createService();
            expect(service.open(request)).toEqual({ ok: false, code: 'INVALID' });
            expect(service.current()).toBeNull();
        });

        it('answers NOT_ALLOWED for an origin off the allowlist, and logs it', () => {
            const logger = createLogger();
            const service = createService(logger);
            const events = record(service);

            expect(service.open({ url: 'https://evil.example/' })).toEqual({ ok: false, code: 'NOT_ALLOWED' });
            expect(events).toEqual([]);
            expect(logger.warn).toHaveBeenCalledTimes(1);
        });

        it('answers ALREADY_OPEN while a view is showing, and keeps the first', () => {
            const service = createService();
            service.open({ url: 'https://foo.apps.chatic.io/a' });

            expect(service.open({ url: 'https://foo.apps.chatic.io/b' })).toEqual({ ok: false, code: 'ALREADY_OPEN' });
            expect(service.current()?.url).toBe('https://foo.apps.chatic.io/a');
        });
    });

    describe('close', () => {
        it('clears the view and reports a close the web should hear about', () => {
            const service = createService();
            service.open({ url: 'https://foo.apps.chatic.io/a' });
            const events = record(service);

            expect(service.close('view-1', 'user')).toEqual({ ok: true });
            expect(service.current()).toBeNull();
            expect(events).toEqual([{ type: 'closed', viewId: 'view-1', reason: 'user', notifyHost: true }]);
        });

        // The screen closes on unmount too; by then the view is usually closed already.
        it('answers NOT_OPEN, and reports nothing, for a view that is not showing', () => {
            const service = createService();
            service.open({ url: 'https://foo.apps.chatic.io/a' });
            service.close('view-1', 'host');
            const events = record(service);

            expect(service.close('view-1', 'user')).toEqual({ ok: false, code: 'NOT_OPEN' });
            expect(events).toEqual([]);
        });

        it('answers INVALID for a missing viewId', () => {
            expect(createService().close(undefined, 'host')).toEqual({ ok: false, code: 'INVALID' });
        });
    });

    describe('resetForNewHost', () => {
        it('dismisses the view without a close for the web', () => {
            const service = createService();
            service.open({ url: 'https://foo.apps.chatic.io/a' });
            const events = record(service);

            service.resetForNewHost();

            expect(service.current()).toBeNull();
            expect(events).toEqual([{ type: 'closed', viewId: 'view-1', reason: 'host', notifyHost: false }]);
        });

        // Every handshake calls it, the first one included.
        it('does nothing when no view is showing', () => {
            const service = createService();
            const events = record(service);

            service.resetForNewHost();

            expect(events).toEqual([]);
        });
    });

    it('still tells the other listener when one throws', () => {
        const logger = createLogger();
        const service = createService(logger);
        service.subscribe(() => {
            throw new Error('boom');
        });
        const events = record(service);

        service.open({ url: 'https://foo.apps.chatic.io/a' });

        expect(events).toHaveLength(1);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('stops telling a listener that unsubscribed', () => {
        const service = createService();
        const listener = jest.fn();
        const unsubscribe = service.subscribe(listener);
        unsubscribe();

        service.open({ url: 'https://foo.apps.chatic.io/a' });

        expect(listener).not.toHaveBeenCalled();
    });
});
