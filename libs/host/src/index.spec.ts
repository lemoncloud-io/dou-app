import * as client from '@chatic/runtime-client';
import * as web from '@chatic/runtime-web';

import * as shim from '.';

/**
 * This package is a transition shim: every name it sells is the one runtime-client or runtime-web
 * owns, so a feature still on `host.ports.<port>` and one already on `runtime.<port>` read the same
 * object.
 */
describe('@chatic/host re-exports', () => {
    afterEach(() => client.host.resetForTests());

    it('the one holder runtime-client keeps', () => {
        expect(shim.host).toBe(client.host);
        expect(shim.HostFacade).toBe(client.HostFacade);
    });

    it("runtime-web's declaration readers", () => {
        expect(shim.resolveCheckoutMethod).toBe(web.resolveCheckoutMethod);
        expect(shim.resolveMediaMethod).toBe(web.resolveMediaMethod);
        expect(shim.resolveFilesMethod).toBe(web.resolveFilesMethod);
        expect(shim.resolveLinksMethod).toBe(web.resolveLinksMethod);
        expect(shim.resolveAppShell).toBe(web.resolveAppShell);
        expect(shim.resolveSignIn).toBe(web.resolveSignIn);
        expect(shim.resolveDiagnosticsMethod).toBe(web.resolveDiagnosticsMethod);
        expect(shim.resolvePushMethod).toBe(web.resolvePushMethod);
        expect(shim.resolveShellOrBrowser).toBe(web.resolveShellOrBrowser);
        expect(shim.hostOsOf).toBe(web.hostOsOf);
    });

    it('a port published through it is the one runtime-client binds', () => {
        shim.host.publish({
            checkout: { kind: 'none' },
            media: { kind: 'browser' },
            files: { kind: 'browser' },
            links: { kind: 'shell' },
            appShell: { kind: 'browser', os: null },
            signIn: { kind: 'browser', os: null },
            diagnostics: { kind: 'browser' },
            push: { kind: 'browser' },
        });

        expect(client.linksPort).toBe(shim.host.ports.links);
    });
});
