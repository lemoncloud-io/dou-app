import { hostProfile } from '@chatic/bridges';
import type { AppShellPort, ShellOrBrowser, SignInPort } from '@chatic/runtime-client';

import { hostOsOf, resolveShellOrBrowser, SHELL_DOMAINS_INTRODUCED_IN, type DeclaredHost } from './shellOrBrowser';

export const resolveLinksMethod = (profile: DeclaredHost = hostProfile()): ShellOrBrowser =>
    resolveShellOrBrowser(profile, 'links', SHELL_DOMAINS_INTRODUCED_IN);

export const resolveAppShell = (profile: DeclaredHost = hostProfile()): Pick<AppShellPort, 'kind' | 'os'> => {
    const kind = resolveShellOrBrowser(profile, 'appShell', SHELL_DOMAINS_INTRODUCED_IN);
    return { kind, os: hostOsOf(profile, kind) };
};

export const resolveSignIn = (profile: DeclaredHost = hostProfile()): Pick<SignInPort, 'kind' | 'os'> => {
    const kind = resolveShellOrBrowser(profile, 'signIn', SHELL_DOMAINS_INTRODUCED_IN);
    return { kind, os: hostOsOf(profile, kind) };
};

export const resolveDiagnosticsMethod = (profile: DeclaredHost = hostProfile()): ShellOrBrowser =>
    resolveShellOrBrowser(profile, 'diagnostics', SHELL_DOMAINS_INTRODUCED_IN);

export const resolvePushMethod = (profile: DeclaredHost = hostProfile()): ShellOrBrowser =>
    resolveShellOrBrowser(profile, 'push', SHELL_DOMAINS_INTRODUCED_IN);
