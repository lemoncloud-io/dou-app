import { runtime } from '@chatic/runtime';

import { isRelayGuest } from '../../../shared/hooks/useRelayAccount';

/**
 * Device pairing is off until the registry turns it on (`feature.auth.devicePairing`). Every entry point
 * and route reads this, so with the key off nothing of the feature is reachable. Read per call —
 * `runtime.settings.get()` answers nothing until the runtime's start has initialised config.
 */
export const isDevicePairingEnabled = (): boolean =>
    runtime.settings.get<boolean>('feature.auth.devicePairing') === true;

/**
 * Whether this client can be the requesting side: a plain browser, as `runtime.signIn` says. The
 * desktop app signs in on its own, and a code shown inside it would ask a phone to approve the app it
 * is already beside.
 */
export const canRequestPairing = (): boolean => isDevicePairingEnabled() && runtime.signIn.requestsPairing;

/**
 * Whether this client can be the approving side: the desktop app (`runtime.signIn` says it approves),
 * signed in to an account, and only one that signed in for itself. Approving
 * hands on a sign-in, so the device doing it has to hold one: a guest has none of its own to give. A
 * session that was itself paired is a delegate of another device — letting it approve would hand out
 * access that the account never granted from a device it trusts.
 */
export const canApprovePairing = (isPairedSession: boolean): boolean =>
    isDevicePairingEnabled() && runtime.signIn.approvesPairing && !isPairedSession && !isRelayGuest();
