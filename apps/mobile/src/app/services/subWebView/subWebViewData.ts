export const SUB_WEBVIEW_DATA_LIMIT = 16 * 1024;

export const SUB_WEBVIEW_TITLE_LIMIT = 100;

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
