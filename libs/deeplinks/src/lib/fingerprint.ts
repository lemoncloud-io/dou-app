/**
 * Device Fingerprint Generator
 *
 * Generates a fingerprint for deferred deep link matching.
 * Uses IP address + device characteristics to match web visitors with app installs.
 *
 * IMPORTANT: Platform is NOT included in fingerprint hash to allow
 * web-to-app matching (web landing page → mobile app install)
 *
 * Accuracy: ~70-80% (same network, similar device settings)
 */

/**
 * Fingerprint components used for matching
 * Note: platform is stored for debugging but NOT used in hash calculation
 */
export interface FingerprintComponents {
    ip: string;
    timezone: string;
    locale: string;
}

/** Response from ipify.org API */
interface IpifyResponse {
    ip: string;
}

/**
 * Get public IP address using external service
 */
const getPublicIP = async (): Promise<string> => {
    try {
        const response = await fetch('https://api.ipify.org?format=json', {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        const data: IpifyResponse = await response.json();
        return data.ip || 'unknown';
    } catch (error) {
        console.error('[Fingerprint] Failed to get IP:', error);
        return 'unknown';
    }
};

/**
 * Get device locale (language code only, e.g., "ko" not "ko-KR")
 * Using language code only ensures matching between web and native app
 */
const getLocale = async (): Promise<string> => {
    try {
        const RNLocalize = await import('react-native-localize');
        const locales = RNLocalize.getLocales();
        const languageTag = locales?.[0]?.languageTag || 'unknown';
        // Extract language code only (e.g., "ko-KR" → "ko")
        return languageTag.split('-')[0];
    } catch {
        return 'unknown';
    }
};

/**
 * Generate fingerprint hash from components
 * Note: Platform is intentionally excluded to allow web-to-app matching
 */
const hashComponents = (components: FingerprintComponents): string => {
    const str = `${components.ip}|${components.timezone}|${components.locale}`;

    // Simple hash for React Native (no native crypto needed)
    // This same algorithm must be used on the web landing page
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }

    return Math.abs(hash).toString(16).padStart(8, '0');
};

/**
 * Generate fingerprint for mobile app
 * @returns Fingerprint hash string
 */
export const generateFingerprint = async (): Promise<string> => {
    const components: FingerprintComponents = {
        ip: await getPublicIP(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: await getLocale(),
    };

    console.log('[Fingerprint] Components:', components);
    return hashComponents(components);
};

/**
 * Generate fingerprint components (for debugging)
 */
export const getFingerprintComponents = async (): Promise<FingerprintComponents> => {
    return {
        ip: await getPublicIP(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: await getLocale(),
    };
};
