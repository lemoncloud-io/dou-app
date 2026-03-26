import type { ProductSubscription, Purchase, PurchaseError } from 'react-native-iap';

/**
 * 구매 요청
 */
export interface PurchasePayload {
    /** 상품 ID (SKU) */
    sku: string;
    /**
     * 이전 상품 ID (SKU)
     * Android에서 upgrade 또는 downgrade 수행시 해당값이 필수적임
     **/
    oldSku?: string;
}

/**
 * 구매 트랜책션 처리 완료 요청
 * 주의: 구매 처리후 해당 메서드를 수행하지 않을 경우 환불처리됨
 */
export interface FinishPurchaseTransactionPayload {
    purchase: Purchase;
}

/**
 * 인앱 결제 구독 상품 정보
 */
export interface OnFetchProductsPayload {
    products: ProductSubscription[];
}

/**
 * 인앱 결제 구매 내역 정보
 */
export interface OnFetchCurrentPurchasesPayload {
    purchases: Purchase[];
}

/**
 * 인앱 결제 구매 정보
 */
export interface OnPurchasePayload {
    purchase: Purchase | PurchaseError;
}

/**
 * 인앱 결제 구매 완료 처리
 */
export interface OnFinishPurchaseTransactionPayload {
    purchase: Purchase;
}
