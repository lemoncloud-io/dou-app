export type SubWebViewTrust = 'firstParty' | 'reviewed' | 'external';

const HUB_HOSTS: readonly string[] = ['apps.chatic.io', 'apps-dev.chatic.io'];

const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const HTTPS_HOST = new RegExp(`^https://(${LABEL}(?:\\.${LABEL})+)(?=[/?#]|$)`, 'i');

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARACTERS = /[\\\s\u0000-\u001f\u007f]/;

const NUMERIC_LAST_LABEL = /(?:^|\.)(?:\d+|0x[0-9a-f]*)$/i;

const hostOf = (url: unknown): string | null => {
    if (typeof url !== 'string' || UNSAFE_CHARACTERS.test(url)) return null;
    const host = HTTPS_HOST.exec(url)?.[1].toLowerCase();
    return host && !NUMERIC_LAST_LABEL.test(host) ? host : null;
};

export const isOpenableSubWebViewUrl = (url: unknown): url is string => hostOf(url) !== null;

export const subWebViewOriginOf = (url: unknown): string | null => {
    const host = hostOf(url);
    return host ? `https://${host}` : null;
};

export const SUB_WEBVIEW_DATA_LIMIT = 16 * 1024;

export const SUB_WEBVIEW_TITLE_LIMIT = 100;

type SubWebViewDisplayName = 'titled' | 'clean' | 'immersive';

const EARLIER_DISPLAY_NAMES: Readonly<Record<string, SubWebViewDisplayName>> = {
    standard: 'titled',
    fullscreen: 'clean',
};

export const subWebViewDisplayOf = (value: unknown): SubWebViewDisplayName | undefined => {
    if (value === 'titled' || value === 'clean' || value === 'immersive') return value;
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EARLIER_DISPLAY_NAMES, value)
        ? EARLIER_DISPLAY_NAMES[value]
        : undefined;
};

export const SUB_WEBVIEW_MESSAGE_LIMIT = 64 * 1024;

export const fitsSubWebViewData = (value: unknown): boolean => {
    if (value === undefined) return true;
    try {
        const json = JSON.stringify(value);
        return json !== undefined && json.length <= SUB_WEBVIEW_DATA_LIMIT;
    } catch {
        return false;
    }
};

export const isSubWebViewParams = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value) && fitsSubWebViewData(value);

export const isSubWebViewAppId = (value: unknown): value is string =>
    typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);

export const subWebViewTrustOf = (url: unknown): SubWebViewTrust | null => {
    const host = hostOf(url);
    if (!host) return null;
    if (HUB_HOSTS.includes(host)) return 'firstParty';
    return HUB_HOSTS.includes(host.slice(host.indexOf('.') + 1)) ? 'reviewed' : 'external';
};
