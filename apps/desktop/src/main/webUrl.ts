export const CUSTOM_UI_SCHEME = 'chatic-local';
export const CUSTOM_UI_HOST = 'bundle';
export const CUSTOM_UI_ORIGIN = `${CUSTOM_UI_SCHEME}://${CUSTOM_UI_HOST}`;
export const CUSTOM_UI_URL = `${CUSTOM_UI_ORIGIN}/`;

export const safeOrigin = (url: string): string | null => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.protocol === `${CUSTOM_UI_SCHEME}:`) {
        return parsed.host === CUSTOM_UI_HOST ? CUSTOM_UI_ORIGIN : null;
    }
    return parsed.origin === 'null' ? null : parsed.origin;
};

let remoteWebUrl = '';
const trustedOrigins = new Set<string>();

export const initWebUrl = (remote: string): void => {
    remoteWebUrl = remote;
    trustedOrigins.clear();
    const origin = safeOrigin(remote);
    if (origin && origin !== CUSTOM_UI_ORIGIN) trustedOrigins.add(origin);
};

export const setCustomUiActive = (active: boolean): void => {
    if (active) trustedOrigins.add(CUSTOM_UI_ORIGIN);
    else trustedOrigins.delete(CUSTOM_UI_ORIGIN);
};

export const isCustomUiActive = (): boolean => trustedOrigins.has(CUSTOM_UI_ORIGIN);

export const isCustomUiUrl = (url: string | undefined): boolean => !!url && safeOrigin(url) === CUSTOM_UI_ORIGIN;

export const resolveWebUrl = (): string => (isCustomUiActive() ? CUSTOM_UI_URL : remoteWebUrl);

export const isTrustedUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    const origin = safeOrigin(url);
    return origin !== null && trustedOrigins.has(origin);
};
