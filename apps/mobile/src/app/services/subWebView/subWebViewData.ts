/** The most a `params` or a `result` may take, serialized: it crosses two bridges and a navigator. */
export const SUB_WEBVIEW_DATA_LIMIT = 16 * 1024;

/** The longest title a page may put in the shell's bar. */
export const SUB_WEBVIEW_TITLE_LIMIT = 100;

/**
 * Whether `value` is JSON that fits the limit. Measured as the serialized string's length — a
 * character count, not bytes, which is close enough for a guard and needs no encoder.
 */
export const fitsSubWebViewData = (value: unknown): boolean => {
    if (value === undefined) return true;
    try {
        const json = JSON.stringify(value);
        return json !== undefined && json.length <= SUB_WEBVIEW_DATA_LIMIT;
    } catch {
        // A cycle, or a BigInt: not JSON.
        return false;
    }
};

/** A plain JSON object (not an array, not null) that fits the limit. */
export const isSubWebViewParams = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value) && fitsSubWebViewData(value);
