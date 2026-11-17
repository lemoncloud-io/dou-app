import { logger, resolveCapability, type HostProfile } from '@chatic/bridges';

/**
 * Who does a domain's work on this host: the app, through its bridge, or the page, with what a
 * browser offers. Every port from `media` on carries this choice, and only the choice: the
 * implementations take their types from the data layer and the runtime, which this package may not
 * reach, so they live in the app that uses them and read the port to know whether the app's side
 * applies.
 */
export type AppOrPage = 'app' | 'page';

const METHODS: readonly AppOrPage[] = ['app', 'page'];

/**
 * Reads one `'app' | 'page'` key of the declaration.
 *
 * - No declaration, or one older than the key — the shell never knew it — answers what the page did
 *   before ports: the app wherever there was a bridge to ask it through, as `isNative()` said.
 * - A declaration that should hold the key and does not, or names anything else, is a bug in the
 *   shell: the page does the work, since every host can do what a browser does, and it is logged.
 */
export const resolveAppOrPage = (profile: HostProfile, key: string, introducedIn: number): AppOrPage => {
    const source = resolveCapability(profile.capabilities, key, introducedIn);
    if (source.from === 'legacy') return profile.bridge === null ? 'page' : 'app';
    if (source.from === 'unavailable') return 'page';
    if ((METHODS as readonly unknown[]).includes(source.value)) return source.value as AppOrPage;
    logger.warn('BRIDGE', `[host] the declared ${key} is neither 'app' nor 'page'; the page does it`, {
        value: source.value,
    });
    return 'page';
};

/** The phone platform the app said it runs on, where the app does the work; `null` anywhere else. */
export type HostOs = 'ios' | 'android' | null;

/**
 * The phone platform behind an `'app'` answer, from the platform global as the shell injected it,
 * matched without regard to case as the screens did. A desktop shell or a browser has none.
 */
export const hostOsOf = (profile: HostProfile, kind: AppOrPage): HostOs => {
    if (kind !== 'app') return null;
    const platform = profile.globals.CHATIC_APP_PLATFORM?.toLowerCase();
    return platform === 'ios' || platform === 'android' ? platform : null;
};

/**
 * The declaration version that introduced the `links`, `appShell`, `signIn`, `diagnostics` and `push`
 * keys — together, so that no build declares one without the others.
 */
export const SHELL_DOMAINS_INTRODUCED_IN = 4;
