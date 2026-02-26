/**
 * Deep Link URL Parser
 *
 * Validates deep link URLs and extracts campaign parameters
 */

const VALID_DOMAINS = ['app.chatic.io', 'dou.chatic.io', 'chatic.io'];
const VALID_SCHEMES = ['chatic', 'https', 'http'];

/**
 * Validates if a URL is a valid deep link
 */
export const isValidDeepLink = (url: string): boolean => {
    try {
        const parsed = new URL(url);

        const scheme = parsed.protocol.replace(':', '');
        if (!VALID_SCHEMES.includes(scheme)) {
            return false;
        }

        // Custom scheme is always valid
        if (scheme === 'chatic') {
            return true;
        }

        // For http/https, validate domain
        if (!VALID_DOMAINS.includes(parsed.hostname)) {
            console.warn(`[DeepLink] Invalid domain: ${parsed.hostname}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[DeepLink] Invalid URL format:', error);
        return false;
    }
};

/**
 * Extracts campaign parameters from URL (UTM, referrer, etc.)
 */
export const extractCampaignParams = (url: string): Record<string, string> => {
    try {
        const parsed = new URL(url);
        const params: Record<string, string> = {};

        // Extract UTM parameters
        const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

        utmParams.forEach(param => {
            const value = parsed.searchParams.get(param);
            if (value) {
                params[param] = value;
            }
        });

        // Extract referrer
        const ref = parsed.searchParams.get('ref') || parsed.searchParams.get('referrer');
        if (ref) {
            params.referrer = ref;
        }

        return params;
    } catch {
        return {};
    }
};

/**
 * Check if URL is a short URL (/s/{code} pattern)
 */
export const isShortUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.pathname.startsWith('/s/');
    } catch {
        return false;
    }
};

/**
 * Extract short code from URL
 */
export const extractShortCode = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/^\/s\/([^/]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
};
