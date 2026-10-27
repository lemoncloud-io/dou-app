import { isNative } from '@chatic/bridges';
import { config } from '@chatic/config';

/**
 * Device pairing is off until the registry turns it on (`feature.auth.devicePairing`). Every entry point
 * and route reads this, so with the key off nothing of the feature is reachable. Read per call —
 * `config.get()` answers nothing until boot has run `config.init()`.
 */
export const isDevicePairingEnabled = (): boolean => config.get<boolean>('feature.auth.devicePairing') === true;

/**
 * Whether this client can be the requesting side: a plain browser. The desktop app signs in on its
 * own, and a code shown inside it would ask a phone to approve the app it is already beside.
 */
export const canRequestPairing = (): boolean => isDevicePairingEnabled() && !isNative();

/**
 * Whether this client can be the approving side: the desktop app, and only one that signed in for
 * itself. A session that was itself paired is a delegate of another device — letting it approve would
 * hand out access that the account never granted from a device it trusts.
 */
export const canApprovePairing = (isPairedSession: boolean): boolean =>
    isDevicePairingEnabled() && isNative() && !isPairedSession;
