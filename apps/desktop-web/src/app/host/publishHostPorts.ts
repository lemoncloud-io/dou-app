import {
    host,
    resolveAppShell,
    resolveDiagnosticsMethod,
    resolveLinksMethod,
    resolvePushMethod,
    resolveSignIn,
} from '@chatic/host';

/**
 * The one file in this app that chooses how the host is reached: it picks an implementation for each
 * of `@chatic/host`'s ports and publishes them, once, from `main.tsx` before the first render.
 *
 * It is also the one file, beside `@chatic/bridges`' host profile, that may ask the host what it is —
 * `isNative()` and the shell's `CHATIC_APP_*` globals — and lint holds that (`@nx/workspace-host-facts`).
 * A feature asks a port, never the host.
 */
export const publishHostPorts = (): void => {
    // The desktop app sells nothing: no screen of it offers a subscription.
    // No screen of the desktop app attaches through an app picker: its inputs are the page's own.
    // Its files move through its own requests; no desktop screen hands a transfer to the shell.
    // The rest read what the desktop shell declared: its window has a bridge, so a shell that declares
    // none of these keys gets the app for each, as `isNative()` answered; a browser tab gets the page.
    host.publish({
        checkout: { kind: 'none' },
        media: { kind: 'page' },
        files: { kind: 'page' },
        links: { kind: resolveLinksMethod() },
        appShell: resolveAppShell(),
        signIn: resolveSignIn(),
        diagnostics: { kind: resolveDiagnosticsMethod() },
        push: { kind: resolvePushMethod() },
    });
};
