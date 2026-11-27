import type { HostPorts } from '@chatic/ports';

export type { HostOs, HostPorts, ShellOrBrowser } from '@chatic/ports';

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
