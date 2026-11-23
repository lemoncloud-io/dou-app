import { logger, resolveCapability, type HostProfile } from '@chatic/bridges';
import type { HostOs, ShellOrBrowser } from '@chatic/runtime-client';

const METHODS: readonly ShellOrBrowser[] = ['shell', 'browser'];

const SHIPPED_SPELLINGS: ReadonlyMap<unknown, ShellOrBrowser> = new Map([
    ['app', 'shell'],
    ['page', 'browser'],
]);

export interface DeclaredHost {
    readonly bridge: HostProfile['bridge'];
    readonly capabilities: HostProfile['capabilities'];
    readonly globals: Pick<HostProfile['globals'], 'CHATIC_APP_PLATFORM'>;
}

export const resolveShellOrBrowser = (profile: DeclaredHost, key: string, introducedIn: number): ShellOrBrowser => {
    const source = resolveCapability(profile.capabilities, key, introducedIn);
    if (source.from === 'legacy') return profile.bridge === null ? 'browser' : 'shell';
    if (source.from === 'unavailable') return 'browser';
    if ((METHODS as readonly unknown[]).includes(source.value)) return source.value as ShellOrBrowser;
    const shipped = SHIPPED_SPELLINGS.get(source.value);
    if (shipped) return shipped;
    logger.warn('BRIDGE', `[host] the declared ${key} is neither 'shell' nor 'browser'; the browser does it`, {
        value: source.value,
    });
    return 'browser';
};

export const hostOsOf = (profile: DeclaredHost, kind: ShellOrBrowser): HostOs => {
    if (kind !== 'shell') return null;
    const injected: unknown = profile.globals.CHATIC_APP_PLATFORM;
    const platform = typeof injected === 'string' ? injected.toLowerCase() : undefined;
    return platform === 'ios' || platform === 'android' ? platform : null;
};

export const SHELL_DOMAINS_INTRODUCED_IN = 4;
