/**
 * App Store URLs for iOS and Android
 * Used for directing users to update the app
 */
export const STORE_URLS = {
    ios: 'https://apps.apple.com/app/id6758658673',
    android: 'https://play.google.com/store/apps/details?id=io.chatic.dou',
} as const;

export type StorePlatform = keyof typeof STORE_URLS;

/**
 * Get the store URL for the given platform
 * @param platform - 'ios' or 'android'
 * @returns The store URL or undefined if platform is not supported
 */
export const getStoreUrl = (platform: string | undefined): string | undefined => {
    if (platform === 'ios' || platform === 'android') {
        return STORE_URLS[platform];
    }
    return undefined;
};
