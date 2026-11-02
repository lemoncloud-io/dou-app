/**
 * Convert to object to URL query string
 */
export const buildQueryString = (params: Record<string, any> = {}): string => {
    if (!params) return '';
    return Object.entries(params)
        .filter(([_, value]) => value !== undefined && value !== null)
        .map(([key, value]) => {
            const encodedKey = encodeURIComponent(key);
            const encodedValue = encodeURIComponent(String(value));
            return `${encodedKey}=${encodedValue}`;
        })
        .join('&');
};

// Parsed by hand rather than with `URL`: React Native's `URL.origin` is a regex over the raw string
// that keeps userinfo, query and fragment, and Jest runs Node's WHATWG `URL` instead, so a check
// built on it would behave differently on device than in its tests. The userinfo group is dropped
// so `https://app.chatic.io@evil.example` reads as `evil.example`, which is where it actually goes.
const ORIGIN_PATTERN = /^(https?):\/\/(?:[^/?#@]*@)?([^/?#]+)/i;

/** `scheme://host[:port]` of an http(s) URL, lower-cased; `null` for anything else. */
export const originOf = (url: string | undefined): string | null => {
    const match = url ? ORIGIN_PATTERN.exec(url) : null;
    return match ? `${match[1].toLowerCase()}://${match[2].toLowerCase()}` : null;
};
