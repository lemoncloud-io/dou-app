import { finishTransaction, initConnection, requestPurchase } from 'react-native-iap';

import { SubscriptionIapService } from './SubscriptionIapService';

// Mock every native import the service pulls in at module load so it can be instantiated under
// jsdom. Only the store-failure paths are exercised here (ADR-0075).
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, Linking: { openURL: jest.fn() } }));
jest.mock('react-native-iap', () => ({
    initConnection: jest.fn(),
    requestPurchase: jest.fn(),
    finishTransaction: jest.fn(),
    getAvailablePurchases: jest.fn(),
    fetchProducts: jest.fn(),
}));
jest.mock('./config', () => ({ itemSkus: ['sku_pro'], getReplacementMode: () => 1 }));

const initMock = initConnection as jest.Mock;
const purchaseMock = requestPurchase as jest.Mock;
const finishMock = finishTransaction as jest.Mock;

describe('SubscriptionIapService — 스토어 실패 기록', () => {
    const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() } as never;
    let service: SubscriptionIapService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new SubscriptionIapService(logger);
    });

    // 연결 실패는 이후 모든 구매를 죽이는데, 그동안 맨몸 rethrow라 원인이 어디에도 없었다.
    it('스토어 연결 실패를 error로 남기고 다시 던진다', async () => {
        initMock.mockRejectedValue(new Error('no store'));

        await expect(service.init()).rejects.toThrow('no store');
        expect((logger as unknown as { error: jest.Mock }).error).toHaveBeenCalledWith(
            'IAP',
            'Store connection failed',
            expect.any(Error)
        );
    });

    it('연결이 되면 아무것도 남기지 않는다', async () => {
        initMock.mockResolvedValue(true);

        await expect(service.init()).resolves.toBe(true);
        expect((logger as unknown as { error: jest.Mock }).error).not.toHaveBeenCalled();
    });

    // 스토어가 왜 거절했는지는 이 층만 본다 — 카탈로그가 핸들러가 아니라 서비스에 이 항목을 둔 이유.
    it('스토어가 구매를 거절하면 상품 id와 함께 error로 남긴다', async () => {
        purchaseMock.mockRejectedValue(new Error('declined'));

        await expect(service.purchase('sku_pro')).rejects.toThrow('declined');
        expect((logger as unknown as { error: jest.Mock }).error).toHaveBeenCalledWith(
            'IAP',
            'Store refused purchase: id=sku_pro',
            expect.any(Error)
        );
    });

    // finish 실패는 스토어가 트랜잭션을 다시 제시해 재청구로 이어진다.
    it('finish 실패를 error로 남기고 다시 던진다', async () => {
        finishMock.mockRejectedValue(new Error('finish boom'));

        await expect(service.finish({ productId: 'sku_pro' } as never)).rejects.toThrow('finish boom');
        expect((logger as unknown as { error: jest.Mock }).error).toHaveBeenCalledWith(
            'IAP',
            'Finish transaction failed: id=sku_pro',
            expect.any(Error)
        );
    });

    it('구매 시도 로그에 offerToken 값을 싣지 않는다', async () => {
        purchaseMock.mockResolvedValue(undefined);

        await service.purchase('sku_pro', 'secret-offer-token');

        const infoCalls = JSON.stringify((logger as unknown as { info: jest.Mock }).info.mock.calls);
        expect(infoCalls).not.toContain('secret-offer-token');
        expect(infoCalls).toContain('hasOfferToken=true');
    });
});
