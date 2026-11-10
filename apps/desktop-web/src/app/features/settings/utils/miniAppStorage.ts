import { type MiniAppLink, parseMiniAppLinks } from '@chatic/shared';

/**
 * Where a cloud's mini apps and the per-host consent are kept: this device's `localStorage`, under
 * keys of their own. Device-only on purpose — the links have no server field yet, so they show only on
 * the computer the owner saved them on, to whoever opens that cloud there.
 *
 * Every access is guarded: a full or blocked storage costs the value, never the settings screen.
 */
const linksKey = (cloudId: string) => `dou.miniAppLinks.${cloudId}`;
// Per account as well as per host: on a shared computer one person's yes must not send another's names.
const consentKey = (accountId: string, host: string) => `dou.miniAppConsent.${accountId}.${host}`;

/** The mini apps saved for `cloudId`, in the owner's order — without any the shell would no longer open. */
export const readMiniAppLinks = (cloudId: string): MiniAppLink[] => {
    try {
        return parseMiniAppLinks(window.localStorage.getItem(linksKey(cloudId)));
    } catch {
        return [];
    }
};

/** Save the whole list for `cloudId`; an empty list removes the key. `false` when the storage refused. */
export const writeMiniAppLinks = (cloudId: string, links: readonly MiniAppLink[]): boolean => {
    try {
        if (links.length === 0) window.localStorage.removeItem(linksKey(cloudId));
        else window.localStorage.setItem(linksKey(cloudId), JSON.stringify(links));
        return true;
    } catch {
        return false;
    }
};

/** Whether the account `accountId` already agreed to hand `host` its names. */
export const hasMiniAppConsent = (accountId: string | null, host: string): boolean => {
    if (!accountId) return false;
    try {
        return window.localStorage.getItem(consentKey(accountId, host)) === '1';
    } catch {
        return false;
    }
};

/**
 * Record the agreement of `accountId` for `host`. A storage that refuses is not an error: the page
 * still opens this time, and the question comes back next time.
 */
export const writeMiniAppConsent = (accountId: string | null, host: string): void => {
    if (!accountId) return;
    try {
        window.localStorage.setItem(consentKey(accountId, host), '1');
    } catch {
        // Asked again next time; nothing else depends on it.
    }
};
