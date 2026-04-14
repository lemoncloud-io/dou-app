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
 * 안드로이드 상품의 등급(Tier)을 계산합니다.
 * @param sku - 등급을 조회할 안드로이드 상품 SKU 코드
 * @returns 1부터 시작하는 등급 점수 (목록에 존재하지 않을 경우 0 반환)
 */
export const getSkuRank = (sku: string): number => {
    if (Platform.OS !== 'android') return 0;
    const index = ANDROID_PLAN_LIST.indexOf(sku);
    return index !== -1 ? index + 1 : 0;
};

/**
 * 업그레이드 및 다운그레이드 모드 계산
 */
export const getReplacementMode = (oldSku: string, newSku: string): SubscriptionReplacementModeAndroid => {
    const oldRank = getSkuRank(oldSku);
    const newRank = getSkuRank(newSku);

    if (newRank > oldRank) {
        return 'with-time-proration'; // 업그레이드
    } else if (newRank < oldRank) {
        return 'deferred'; // 다운그레이드
    }
    return 'with-time-proration';
};
