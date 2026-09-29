import { defineDebugStrings } from '../define';

const en = {
    title: 'In-App Purchase',
    subtitle: 'See exactly what the store returns',
    fetchProducts: 'Fetch products',
    purchaseHistory: 'Purchase history',
    // Operation label passed to `fire()` — distinct from the "Store" button caption below.
    openStoreOperation: 'Open store',
    storeButton: 'Store',
    manageSubscription: 'Manage subscription',
    productsTitle: (count: number) => `Products (${count})`,
    noProducts: 'No products — this needs the app shell and a store account to fetch',
    purchaseRequest: (id: string) => `Purchase request ${id}`,
    buy: 'Buy',
    raw: 'Raw',
    purchaseEventsTitle: 'Purchase events',
    noEvents: "None yet — purchase results arrive as events, not as the request's response",
    eventSuccess: 'success',
    eventFailure: 'failure',
};

const ko: typeof en = {
    title: '인앱결제',
    subtitle: '스토어가 돌려준 값을 그대로 봅니다',
    fetchProducts: '상품 조회',
    purchaseHistory: '구매 내역',
    openStoreOperation: '스토어 열기',
    storeButton: '스토어',
    manageSubscription: '구독 관리',
    productsTitle: (count: number) => `상품 (${count})`,
    noProducts: '상품이 없습니다 — 앱 셸과 스토어 계정이 있어야 조회됩니다',
    purchaseRequest: (id: string) => `구매 요청 ${id}`,
    buy: '구매',
    raw: '원문',
    purchaseEventsTitle: '구매 이벤트',
    noEvents: '아직 없습니다 — 구매 결과는 요청의 응답이 아니라 이벤트로 옵니다',
    eventSuccess: '성공',
    eventFailure: '실패',
};

export const useIapScreenStrings = defineDebugStrings({ ko, en });
