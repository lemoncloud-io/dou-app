import { pairingClientOf as pairingClientOfDevice } from '@chatic/auth';

type ShellGlobals = { CHATIC_APP_PLATFORM?: string };

/**
 * This page's device as a pairing's other side is told it: the shell's platform and the page's own
 * user agent, read from the page itself — not from the runtime's transport, which a page whose session
 * runs in the app's process never configures.
 */
export const pairingClientOf = () =>
    pairingClientOfDevice({
        appPlatform:
            typeof window === 'undefined' ? undefined : (window as unknown as ShellGlobals).CHATIC_APP_PLATFORM,
        userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    });
