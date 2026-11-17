import { deviceStore } from '../../../storage';

/**
 * Where the per-host consent to open a site DoU does not run is kept: the app's device store
 * (`localStorage`), under a key of its own. The cloud's mini app link itself is on the relay, not here.
 *
 * The device store is tolerant: a full or blocked storage costs the answer, never the settings screen.
 */
// Per account as well as per host: on a shared computer one person's yes must not send another's names.
const consentKey = (accountId: string, host: string) => `dou.miniAppConsent.${accountId}.${host}`;

/** Whether the account `accountId` already agreed to hand `host` its names. */
export const hasMiniAppConsent = (accountId: string | null, host: string): boolean => {
    if (!accountId) return false;
    return deviceStore.get(consentKey(accountId, host)) === '1';
};

/**
 * Record the agreement of `accountId` for `host`. A storage that refuses is not an error: the page
 * still opens this time, and the question comes back next time.
 */
export const writeMiniAppConsent = (accountId: string | null, host: string): void => {
    if (!accountId) return;
    // A dropped write means the question comes back next time; nothing else depends on it.
    deviceStore.set(consentKey(accountId, host), '1');
};
