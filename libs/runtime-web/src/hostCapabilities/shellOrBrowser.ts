import { logger, resolveCapability, type HostProfile } from '@chatic/bridges';
import type { HostOs, ShellOrBrowser } from '@chatic/runtime-client';

const METHODS: readonly ShellOrBrowser[] = ['shell', 'browser'];

/**
 * Reads one `'shell' | 'browser'` key of the declaration.
 *
 * - No declaration, or one older than the key — the shell never knew it — answers what the page did
 *   before ports: the shell wherever there was a bridge to ask it through, as `isNative()` said.
 * - A declaration that should hold the key and does not, or names anything else, is a bug in the
 *   shell: the browser does the work, since every host can do what a browser does, and it is logged.
 */
export const resolveShellOrBrowser = (profile: HostProfile, key: string, introducedIn: number): ShellOrBrowser => {
    const source = resolveCapability(profile.capabilities, key, introducedIn);
    if (source.from === 'legacy') return profile.bridge === null ? 'browser' : 'shell';
    if (source.from === 'unavailable') return 'browser';
    if ((METHODS as readonly unknown[]).includes(source.value)) return source.value as ShellOrBrowser;
    logger.warn('BRIDGE', `[host] the declared ${key} is neither 'shell' nor 'browser'; the browser does it`, {
        value: source.value,
    });
    return 'browser';
};

/**
 * The phone platform behind a `'shell'` answer, from the platform global as the shell injected it,
 * matched without regard to case as the screens did. A desktop shell or a browser has none.
 */
export const hostOsOf = (profile: HostProfile, kind: ShellOrBrowser): HostOs => {
    if (kind !== 'shell') return null;
    const injected: unknown = profile.globals.CHATIC_APP_PLATFORM;
    const platform = typeof injected === 'string' ? injected.toLowerCase() : undefined;
    return platform === 'ios' || platform === 'android' ? platform : null;
};

/**
 * The declaration version that introduced the `links`, `appShell`, `signIn`, `diagnostics` and `push`
 * keys — together, so that no build declares one without the others.
 */
export const SHELL_DOMAINS_INTRODUCED_IN = 4;
