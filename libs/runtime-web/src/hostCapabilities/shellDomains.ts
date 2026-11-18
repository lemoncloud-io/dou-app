import { hostProfile, type HostProfile } from '@chatic/bridges';
import type { AppShellPort, ShellOrBrowser, SignInPort } from '@chatic/runtime-client';

import { hostOsOf, resolveShellOrBrowser, SHELL_DOMAINS_INTRODUCED_IN } from './shellOrBrowser';

// The five domains that arrived together in declaration version 4. Each reads one `'shell' | 'browser'`
// key; `appShell` and `signIn` also carry the phone platform behind a `'shell'` answer.

/** Who takes the page's links out of it. */
export const resolveLinksMethod = (profile: HostProfile = hostProfile()): ShellOrBrowser =>
    resolveShellOrBrowser(profile, 'links', SHELL_DOMAINS_INTRODUCED_IN);

/** Who runs the frame around the page, and on which phone platform where the shell does. */
export const resolveAppShell = (profile: HostProfile = hostProfile()): AppShellPort => {
    const kind = resolveShellOrBrowser(profile, 'appShell', SHELL_DOMAINS_INTRODUCED_IN);
    return { kind, os: hostOsOf(profile, kind) };
};

/** Who signs a person in, and with which phone platform's own sign-in where the shell does. */
export const resolveSignIn = (profile: HostProfile = hostProfile()): SignInPort => {
    const kind = resolveShellOrBrowser(profile, 'signIn', SHELL_DOMAINS_INTRODUCED_IN);
    return { kind, os: hostOsOf(profile, kind) };
};

/** Where the page's diagnostics go. */
export const resolveDiagnosticsMethod = (profile: HostProfile = hostProfile()): ShellOrBrowser =>
    resolveShellOrBrowser(profile, 'diagnostics', SHELL_DOMAINS_INTRODUCED_IN);

/** Who receives notifications for this device. */
export const resolvePushMethod = (profile: HostProfile = hostProfile()): ShellOrBrowser =>
    resolveShellOrBrowser(profile, 'push', SHELL_DOMAINS_INTRODUCED_IN);
