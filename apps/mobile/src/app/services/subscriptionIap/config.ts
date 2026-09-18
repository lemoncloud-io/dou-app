import { Platform } from 'react-native';
import Config from 'react-native-config';
import type { SubscriptionReplacementModeAndroid } from 'react-native-iap';

export const IOS_SKU_LIST: string[] = (Config.VITE_SUBSCRIPTION_IAP_SKUS_IOS ?? '')
    .split(',')
    .map(sku => sku.trim())
    .filter(sku => sku.length > 0);

export const ANDROID_SKU_LIST: string[] = (Config.VITE_SUBSCRIPTION_IAP_SKUS_ANDROID ?? '')
    .split(',')
    .map(sku => sku.trim())
    .filter(sku => sku.length > 0);

export const ANDROID_PLAN_LIST = (Config.VITE_SUBSCRIPTION_IAP_PLANS_ANDROID ?? '')
    .split(',')
    .map(sku => sku.trim())
    .filter(sku => sku.length > 0);

export const itemSkus: string[] =
    Platform.select({
        ios: IOS_SKU_LIST,
        android: ANDROID_SKU_LIST,
    }) ?? [];

/**
 * Computes the tier of an Android product.
 * @param sku - the Android product SKU code to look up the tier for
 * @returns a rank score starting from 1 (returns 0 if not found in the list)
 */
export const getSkuRank = (sku: string): number => {
    if (Platform.OS !== 'android') return 0;
    const index = ANDROID_PLAN_LIST.indexOf(sku);
    return index !== -1 ? index + 1 : 0;
};

/**
 * Computes the upgrade/downgrade mode
 */
export const getReplacementMode = (oldSku: string, newSku: string): SubscriptionReplacementModeAndroid => {
    const oldRank = getSkuRank(oldSku);
    const newRank = getSkuRank(newSku);

    if (newRank > oldRank) {
        return 'with-time-proration'; // upgrade
    } else if (newRank < oldRank) {
        return 'deferred'; // downgrade
    }
    return 'with-time-proration';
};
