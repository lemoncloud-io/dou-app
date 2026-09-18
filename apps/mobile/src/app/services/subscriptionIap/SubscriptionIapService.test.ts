import { finishTransaction, initConnection, requestPurchase } from 'react-native-iap';

import { SubscriptionIapService } from './SubscriptionIapService';

// Mock every native import the service pulls in at module load so it can be instantiated under
// jsdom. Only the store-failure paths are exercised here (ADR-0099).
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

    // A connection failure kills every purchase after it, but until now it was a bare rethrow, so the cause was logged nowhere.
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

    // Only this layer sees why the store declined — that's why this entry lives in the service, not the catalog/handler.
    it('스토어가 구매를 거절하면 상품 id와 함께 error로 남긴다', async () => {
        purchaseMock.mockRejectedValue(new Error('declined'));

        await expect(service.purchase('sku_pro')).rejects.toThrow('declined');
        expect((logger as unknown as { error: jest.Mock }).error).toHaveBeenCalledWith(
            'IAP',
            'Store refused purchase: id=sku_pro',
            expect.any(Error)
        );
    });

    // A finish failure leads the store to re-present the transaction, causing a re-charge.
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
