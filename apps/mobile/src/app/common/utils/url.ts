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
