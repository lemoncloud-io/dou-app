import type { ProductSubscription, Purchase, PurchaseError } from 'react-native-iap';

export type AndroidOfferTokens = {
    freeTrial: string | null; // 무료 체험용 토큰
    base: string | null; // 일반 과금용 토큰
};

/**
 * iOS/Android 통합 구독 상품 인터페이스
 */
export type IapProductSubscription = ProductSubscription & {
    /**
     * 실제 결제에 사용될 구독 상품 아이디
     */
    id: string;
    /**
     * Android 전용 플랜 아이디
     * 구독 상품 하위 플랜값
     */
    basePlanId?: string;

    /**
     * 상품명 (product.title 등)
     */
    displayName?: string | null;
    /**
     * 포맷팅된 가격 (예: ₩10,000)
     */
    displayPrice: string;
    /**
     * 화폐 단위 (예: KRW)
     */
    currency: string;

    /**
     * (Android 전용)
     * 구독 토큰 목록
     * 무료 체험 여부에 따라 골라 써야 하므로 필수적입니다.
     */
    androidOfferToken?: AndroidOfferTokens;
};

/**
 * 구매 요청
 */
export type PurchasePayload = {
    /** * 상품 ID (SKU)
     * iOS: 고유 상품 식별자
     * Android: 최상위 부모 상품 ID (productId)
     **/
    id: string;

    /**
     * (Android 필수) 결제할 구체적인 오퍼 토큰
     * 무료 체험 여부나 플랜 정보가 이 안에 포함됨
     **/
    offerToken?: string;

    /**
     * (Android 전용) 현재 구독 중인 요금제 ID (basePlanId)
     * 업그레이드/다운그레이드 판별을 위한 기존 플랜의 ID
     **/
    oldPlanId?: string;

    /**
     * (Android 전용) 새로 결제하려는 요금제 ID (basePlanId)
     * 등급 비교를 위해 사용됨
     **/
    newPlanId?: string;
};

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
    products: IapProductSubscription[];
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
