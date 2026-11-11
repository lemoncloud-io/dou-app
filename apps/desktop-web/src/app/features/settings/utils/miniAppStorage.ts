import { type MiniAppLink, parseMiniAppLinks } from '@chatic/shared';

import { deviceStore } from '../../../storage';

/**
 * Where a cloud's mini apps and the per-host consent are kept: the app's device store (`localStorage`),
 * under keys of their own. Device-only on purpose — the links have no server field yet, so they show only on
 * the computer the owner saved them on, to whoever opens that cloud there.
 *
 * The device store is tolerant: a full or blocked storage costs the value, never the settings screen.
 * A list write is read back, so a refused one can still be reported to the screen.
 */
const linksKey = (cloudId: string) => `dou.miniAppLinks.${cloudId}`;
// Per account as well as per host: on a shared computer one person's yes must not send another's names.
const consentKey = (accountId: string, host: string) => `dou.miniAppConsent.${accountId}.${host}`;

/** The mini apps saved for `cloudId`, in the owner's order — without any the shell would no longer open. */
export const readMiniAppLinks = (cloudId: string): MiniAppLink[] => {
    return parseMiniAppLinks(deviceStore.get(linksKey(cloudId)));
};

/** Save the whole list for `cloudId`; an empty list removes the key. `false` when the storage refused. */
export const writeMiniAppLinks = (cloudId: string, links: readonly MiniAppLink[]): boolean => {
    const key = linksKey(cloudId);
    if (links.length === 0) {
        deviceStore.remove(key);
        return deviceStore.get(key) === null;
    }
    const value = JSON.stringify(links);
    deviceStore.set(key, value);
    return deviceStore.get(key) === value;
};

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
