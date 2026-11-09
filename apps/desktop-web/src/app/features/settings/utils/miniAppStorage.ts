import { isOpenableSubWebViewUrl } from '@chatic/shared';

/**
 * Where a cloud's mini app link and the per-host consent are kept: this device's `localStorage`, under
 * keys of their own. Device-only on purpose — the link has no server field yet, so only the owner who
 * saved it sees it, on this computer.
 *
 * Every access is guarded: a full or blocked storage costs the value, never the settings screen.
 */
const linkKey = (cloudId: string) => `dou.miniAppLink.${cloudId}`;
const consentKey = (host: string) => `dou.miniAppConsent.${host}`;

/** The link saved for `cloudId`, or `null` — also for a stored value the shell would no longer open. */
export const readMiniAppLink = (cloudId: string): string | null => {
    try {
        const stored = window.localStorage.getItem(linkKey(cloudId));
        return stored && isOpenableSubWebViewUrl(stored) ? stored : null;
    } catch {
        return null;
    }
};

/** Save (`url`) or remove (`null`) the link for `cloudId`. `false` when the storage refused. */
export const writeMiniAppLink = (cloudId: string, url: string | null): boolean => {
    try {
        if (url === null) window.localStorage.removeItem(linkKey(cloudId));
        else window.localStorage.setItem(linkKey(cloudId), url);
        return true;
    } catch {
        return false;
    }
};

/** Whether the user already agreed to hand `host` their names. */
export const hasMiniAppConsent = (host: string): boolean => {
    try {
        return window.localStorage.getItem(consentKey(host)) === '1';
    } catch {
        return false;
    }
};

/**
 * Record the user's agreement for `host`. A storage that refuses is not an error: the page still
 * opens this time, and the question comes back next time.
 */
export const writeMiniAppConsent = (host: string): void => {
    try {
        window.localStorage.setItem(consentKey(host), '1');
    } catch {
        // Asked again next time; nothing else depends on it.
    }
};
