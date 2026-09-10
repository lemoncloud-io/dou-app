import { config } from '@chatic/config';

/**
 * Turns what a tester typed into a deeplink this build's app will actually answer.
 *
 * Mirrors what the app's own `deeplinkService.handleUrl` did before the panel moved to the web
 * (ADR-0080 결정 11): a relative path gets the app's scheme prefixed, an absolute URL is left alone.
 *
 * **The scheme comes from `net.deeplink.scheme`, never a literal.** It is `chatic` on PROD and
 * `chatic-dev` on DEV (`byStage`), and a device can have both channels installed — a hardcoded
 * `chatic://` would silently open the OTHER channel's app from a dev build, which is the same
 * cross-channel hazard `apps/desktop-web`'s `oauth.ts` guards against.
 *
 * An already-absolute input passes through UNCHANGED on purpose: testing that the other channel's
 * scheme does *not* capture this build is a case worth being able to run, and it is what the app's
 * screen offered with its separate dev/prod buttons.
 */
export const buildAppDeeplink = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    // Any `scheme://` prefix means the caller chose a target channel; respect it.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;

    const scheme = config.get<string>('net.deeplink.scheme') ?? 'chatic';
    return `${scheme}://${trimmed.replace(/^\/+/, '')}`;
};
