import type { AppShellPort } from './appShell';
import type { CheckoutPort } from './checkout';
import type { DiagnosticsPort } from './diagnostics';
import type { FilesPort } from './files';
import type { LinksPort } from './links';
import type { MediaPort } from './media';
import type { PushPort } from './push';
import type { SignInPort } from './signIn';

export type ShellOrBrowser = 'shell' | 'browser';

export type HostOs = 'ios' | 'android' | null;

export interface HostPorts {
    checkout: CheckoutPort;
    media: MediaPort;
    files: FilesPort;
    links: LinksPort;
    appShell: AppShellPort;
    signIn: SignInPort;
    diagnostics: DiagnosticsPort;
    push: PushPort;
}

export const HOST_PORT_NAMES = [
    'checkout',
    'media',
    'files',
    'links',
    'appShell',
    'signIn',
    'diagnostics',
    'push',
] as const satisfies readonly (keyof HostPorts)[];
