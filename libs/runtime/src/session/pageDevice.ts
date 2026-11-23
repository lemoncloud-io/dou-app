import { pairingClientOf as pairingClientOfDevice } from '@chatic/auth';
import { hostProfile } from '@chatic/bridges';

export const pairingClientOf = () =>
    pairingClientOfDevice({
        appPlatform: hostProfile().globals.CHATIC_APP_PLATFORM,
        userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    });
