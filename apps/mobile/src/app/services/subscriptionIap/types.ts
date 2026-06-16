import type { Purchase } from 'react-native-iap';
import type { IapProductSubscription } from '@chatic/app-messages';

export type { IapProductSubscription };

export interface ISubscriptionIapService {
    /** 인앱결제 모듈 초기화 */
    init(): Promise<boolean>;

    /**
     * 사용자의 과거 결제 내역(영수증)을 스토어에서 조회합니다.
     */
    getAvailablePurchases(): Promise<Purchase[]>;

    /**
     * 구독 상품 목록 불러오기
     */
    getSubscriptions(): Promise<IapProductSubscription[]>;

    /**
     * 구매 신청
     * @param id 상품 코드 (sku)
     * @param offerToken (Android 필수) 결제할 오퍼 토큰
     * @param oldPlanId (Android) 현재 구독 중인 요금제 ID (basePlanId)
     * @param newPlanId (Android) 새로 결제하려는 요금제 ID (basePlanId) - 업/다운 판별용
     */
    purchase(id: string, offerToken?: string, oldPlanId?: string, newPlanId?: string): Promise<void>;

    /**
     * 구독 완료 트랜잭션 처리
     * @param purchase 구매 정보
     */
    finish(purchase: Purchase): Promise<Purchase>;

    /**
     * 구독 관리 페이지 이동
     */
    linkToManageSubscriptions(): Promise<void>;
}
