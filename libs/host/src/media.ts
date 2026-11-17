import { hostProfile, logger, resolveCapability, type HostProfile } from '@chatic/bridges';

/**
 * Who picks the photos, videos and documents a person attaches.
 *
 * - `app` — the app does: its own picker and photo library, its video conversion, and the permission
 *   prompts behind them. What it picked stays in the app and goes up from there.
 * - `page` — the page does, with its own file input; nothing else is on offer.
 *
 * Only the choice crosses this port. The app-side implementations take types from the data layer and
 * the runtime, which this package may not reach, so they live in the app that uses them. They, and
 * the screens around them, read this port to know whether the app's side applies.
 */
export interface MediaPort {
    readonly kind: MediaMethod;
}

export type MediaMethod = 'app' | 'page';

/** The declaration version that introduced `media`. */
export const MEDIA_INTRODUCED_IN = 2;

const MEDIA_METHODS: readonly MediaMethod[] = ['app', 'page'];

/** What the page did before the port: the app picked wherever there was a bridge to ask it through. */
const legacyMediaMethod = (profile: HostProfile): MediaMethod => (profile.bridge === null ? 'page' : 'app');

/**
 * Who picks on this host. A declaration names `'app'` or `'page'`; anything else is a bug in the shell,
 * answered with the page's own input — the one picker every host has — and logged. A declaration older
 * than version 2 never knew the key, so the legacy rule answers for it.
 */
export const resolveMediaMethod = (profile: HostProfile = hostProfile()): MediaMethod => {
    const source = resolveCapability(profile.capabilities, 'media', MEDIA_INTRODUCED_IN);
    switch (source.from) {
        case 'legacy':
            return legacyMediaMethod(profile);
        case 'unavailable':
            return 'page';
        case 'declaration':
            if ((MEDIA_METHODS as readonly unknown[]).includes(source.value)) return source.value as MediaMethod;
            logger.warn('BRIDGE', '[host] the declared media is not a method this page knows; the page picks', {
                value: source.value,
            });
            return 'page';
    }
};
