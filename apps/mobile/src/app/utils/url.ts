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

const ORIGIN_PATTERN = /^(https?):\/\/(?:[^/?#@]*@)?([^/?#]+)/i;

export const originOf = (url: string | undefined): string | null => {
    const match = url ? ORIGIN_PATTERN.exec(url) : null;
    return match ? `${match[1].toLowerCase()}://${match[2].toLowerCase()}` : null;
};
