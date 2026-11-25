import { runtime } from '@chatic/runtime-react';

import { isRelayGuest } from '../../../shared/hooks/useRelayAccount';

export const isDevicePairingEnabled = (): boolean =>
    runtime.settings.get<boolean>('feature.auth.devicePairing') === true;

export const canRequestPairing = (): boolean => isDevicePairingEnabled() && runtime.signIn.requestsPairing;

export const canApprovePairing = (isPairedSession: boolean): boolean =>
    isDevicePairingEnabled() && runtime.signIn.approvesPairing && !isPairedSession && !isRelayGuest();
