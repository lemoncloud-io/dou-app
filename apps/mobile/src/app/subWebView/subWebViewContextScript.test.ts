import type { SubWebViewContext } from '@chatic/app-messages';

import { buildSubWebViewContextScript } from './subWebViewContextScript';

const CONTEXT: SubWebViewContext = {
    protocolVersion: 1,
    viewId: 'view-1',
    platform: 'ios',
    appVersion: '0.30.1',
    locale: 'ko',
    theme: 'dark',
    params: { orderId: 7, note: 'line\u2028break' },
};

/** Runs the script against a stand-in `window` on `origin`, as the WebView would before the page. */
const runOn = (origin: string, script: string) => {
    const window: Record<string, any> = { location: { origin } };
    // eslint-disable-next-line no-new-func -- running the injected script is what is under test
    new Function('window', script)(window);
    return window;
};

describe('buildSubWebViewContextScript', () => {
    it('defines the context, frozen, on the origin the view was opened on', () => {
        const script = buildSubWebViewContextScript(CONTEXT, 'https://foo.apps.chatic.io/orders?x=1');

        const window = runOn('https://foo.apps.chatic.io', script);

        expect(window.ChaticSubWebView).toEqual(CONTEXT);
        expect(Object.isFrozen(window.ChaticSubWebView)).toBe(true);
        expect(Object.isFrozen(window.ChaticSubWebView.params)).toBe(true);
    });

    it('freezes nested params and keeps the property from being reassigned', () => {
        const script = buildSubWebViewContextScript(
            { ...CONTEXT, params: { order: { id: 7, lines: [1, 2] } } },
            'https://foo.apps.chatic.io/'
        );
        const window = runOn('https://foo.apps.chatic.io', script);

        expect(Object.isFrozen(window.ChaticSubWebView.params.order)).toBe(true);
        expect(Object.isFrozen(window.ChaticSubWebView.params.order.lines)).toBe(true);
        expect(Object.getOwnPropertyDescriptor(window, 'ChaticSubWebView')).toEqual(
            expect.objectContaining({ writable: false, configurable: false })
        );
    });

    // Written as an object literal, `__proto__` would set the prototype and vanish as a key.
    it('keeps a __proto__ key in params as data', () => {
        const params = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
        const script = buildSubWebViewContextScript({ ...CONTEXT, params }, 'https://foo.apps.chatic.io/');

        const context = runOn('https://foo.apps.chatic.io', script).ChaticSubWebView;

        expect(Object.prototype.hasOwnProperty.call(context.params, '__proto__')).toBe(true);
        expect((context.params as { polluted?: boolean }).polluted).toBeUndefined();
    });

    // Android runs it before content loads and again at load end.
    it('runs a second time without throwing or replacing the context', () => {
        const script = buildSubWebViewContextScript(CONTEXT, 'https://foo.apps.chatic.io/');
        const window = runOn('https://foo.apps.chatic.io', script);
        const first = window.ChaticSubWebView;

        // eslint-disable-next-line no-new-func -- running the injected script is what is under test
        expect(() => new Function('window', script)(window)).not.toThrow();
        expect(window.ChaticSubWebView).toBe(first);
    });

    // `params` were meant for the page the web opened, not one it navigated to.
    it('defines nothing on any other origin, another allowlisted one included', () => {
        const script = buildSubWebViewContextScript(CONTEXT, 'https://foo.apps.chatic.io/');

        expect(runOn('https://bar.apps.chatic.io', script).ChaticSubWebView).toBeUndefined();
        expect(runOn('https://evil.example', script).ChaticSubWebView).toBeUndefined();
    });

    it('keeps a value that would end a script string intact', () => {
        const script = buildSubWebViewContextScript(
            { ...CONTEXT, params: { quote: '"\'`</script>' } },
            'https://foo.apps.chatic.io/'
        );

        expect(runOn('https://foo.apps.chatic.io', script).ChaticSubWebView.params).toEqual({ quote: '"\'`</script>' });
    });

    // Nothing that identifies the device, the install or the user is in the contract.
    it('carries only the declared fields', () => {
        const script = buildSubWebViewContextScript(CONTEXT, 'https://foo.apps.chatic.io/');

        expect(Object.keys(runOn('https://foo.apps.chatic.io', script).ChaticSubWebView).sort()).toEqual(
            ['appVersion', 'locale', 'params', 'platform', 'protocolVersion', 'theme', 'viewId'].sort()
        );
        expect(script).not.toMatch(/CHATIC_APP_|deviceId|installationId|ChaticMessageHandler/);
    });
});
