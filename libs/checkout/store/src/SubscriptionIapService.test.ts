import { Linking } from 'react-native';
import {
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    initConnection,
    requestPurchase,
} from 'react-native-iap';

import { appleStore } from './apple';
import { googleStore, replacementModeFor } from './google';
import { SubscriptionIapService } from './SubscriptionIapService';

jest.mock('react-native', () => ({ Linking: { openURL: jest.fn() } }));
jest.mock('react-native-iap', () => ({
    initConnection: jest.fn(),
    requestPurchase: jest.fn(),
    finishTransaction: jest.fn(),
    getAvailablePurchases: jest.fn(),
    fetchProducts: jest.fn(),
}));

const initMock = initConnection as jest.Mock;
const purchaseMock = requestPurchase as jest.Mock;
const finishMock = finishTransaction as jest.Mock;
const fetchProductsMock = fetchProducts as jest.Mock;
const availableMock = getAvailablePurchases as jest.Mock;
const openUrlMock = Linking.openURL as jest.Mock;

const makeLogger = () => ({ error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() });

const apple = appleStore({ skus: ['sku_pro'] });
const google = googleStore({ skus: ['sku_pro'], planOrder: ['plan_basic', 'plan_pro'] });

describe('SubscriptionIapService — store failures are logged', () => {
    let logger: ReturnType<typeof makeLogger>;
    let service: SubscriptionIapService;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = makeLogger();
        service = new SubscriptionIapService(logger, apple);
    });

    it('logs a failed store connection as an error and rethrows it', async () => {
        initMock.mockRejectedValue(new Error('no store'));

        await expect(service.init()).rejects.toThrow('no store');
        expect(logger.error).toHaveBeenCalledWith('IAP', 'Store connection failed', expect.any(Error));
    });

    it('logs nothing when the connection opens', async () => {
        initMock.mockResolvedValue(true);

        await expect(service.init()).resolves.toBe(true);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs a refused purchase as an error with the product id', async () => {
        purchaseMock.mockRejectedValue(new Error('declined'));

        await expect(service.purchase('sku_pro')).rejects.toThrow('declined');
        expect(logger.error).toHaveBeenCalledWith('IAP', 'Store refused purchase: id=sku_pro', expect.any(Error));
    });

    it('logs a failed finish as an error and rethrows it', async () => {
        finishMock.mockRejectedValue(new Error('finish boom'));

        await expect(service.finish({ productId: 'sku_pro' } as never)).rejects.toThrow('finish boom');
        expect(logger.error).toHaveBeenCalledWith('IAP', 'Finish transaction failed: id=sku_pro', expect.any(Error));
    });

    it('keeps the offer token out of the purchase attempt log', async () => {
        purchaseMock.mockResolvedValue(undefined);

        await service.purchase('sku_pro', 'secret-offer-token');

        const infoCalls = JSON.stringify(logger.info.mock.calls);
        expect(infoCalls).not.toContain('secret-offer-token');
        expect(infoCalls).toContain('hasOfferToken=true');
    });

    it('returns no products and asks the store nothing when the strategy has no SKUs', async () => {
        const empty = new SubscriptionIapService(logger, appleStore({ skus: [] }));

        await expect(empty.getSubscriptions()).resolves.toEqual([]);
        expect(fetchProductsMock).not.toHaveBeenCalled();
    });
});

describe('apple strategy', () => {
    let service: SubscriptionIapService;
    const iosProduct = {
        id: 'sku_pro',
        title: 'DoU Pro (1 Place)',
        displayName: 'DoU Pro (1 Place)',
        displayPrice: '$6.00',
        currency: 'USD',
        price: 6,
        platform: 'ios',
        type: 'subs',
        subscriptionPeriodNumberIOS: '1',
        subscriptionPeriodUnitIOS: 'month',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        service = new SubscriptionIapService(makeLogger(), apple);
    });

    it('keeps the store displayPrice on an iOS product', async () => {
        fetchProductsMock.mockResolvedValue([iosProduct]);

        const [product] = await service.getSubscriptions();

        expect(fetchProductsMock).toHaveBeenCalledWith({ skus: ['sku_pro'], type: 'subs' });
        expect(product.displayPrice).toBe('$6.00');
        expect(product.displayName).toBe('DoU Pro (1 Place)');
        expect(product.billingPeriod).toBe('P1M');
        expect(product.periodUnit).toBe('month');
        expect(product.periodNumber).toBe(1);
    });

    it('leaves the billing period unset when the store gives no period', async () => {
        fetchProductsMock.mockResolvedValue([
            { ...iosProduct, subscriptionPeriodNumberIOS: null, subscriptionPeriodUnitIOS: null },
        ]);

        const [product] = await service.getSubscriptions();

        expect(product.displayPrice).toBe('$6.00');
        expect(product.billingPeriod).toBeUndefined();
        expect(product.periodNumber).toBeUndefined();
    });

    it('treats an empty period unit as no billing period', async () => {
        fetchProductsMock.mockResolvedValue([{ ...iosProduct, subscriptionPeriodUnitIOS: 'empty' }]);

        const [product] = await service.getSubscriptions();

        expect(product.billingPeriod).toBeUndefined();
        expect(product.periodUnit).toBeUndefined();
    });

    it('returns an empty list when the store returns nothing', async () => {
        fetchProductsMock.mockResolvedValue(null);

        await expect(service.getSubscriptions()).resolves.toEqual([]);
    });

    it('purchases without an offer token and sends no Google request', async () => {
        purchaseMock.mockResolvedValue(undefined);

        await service.purchase('sku_pro');

        expect(purchaseMock).toHaveBeenCalledWith({
            type: 'subs',
            request: {
                apple: { sku: 'sku_pro', andDangerouslyFinishTransactionAutomatically: false },
                google: undefined,
            },
        });
        expect(availableMock).not.toHaveBeenCalled();
    });

    it('opens the App Store subscriptions page', async () => {
        await service.linkToManageSubscriptions();

        expect(openUrlMock).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
    });
});

describe('google strategy', () => {
    let logger: ReturnType<typeof makeLogger>;
    let service: SubscriptionIapService;

    const phase = (billingPeriod: string, micros: string, formattedPrice: string) => ({
        billingPeriod,
        priceAmountMicros: micros,
        formattedPrice,
    });
    const offer = (basePlanIdAndroid: string, offerTokenAndroid: string, phases: ReturnType<typeof phase>[]) => ({
        basePlanIdAndroid,
        offerTokenAndroid,
        pricingPhasesAndroid: { pricingPhaseList: phases },
    });
    const androidProduct = {
        id: 'sku_pro',
        title: 'DoU Pro',
        displayPrice: '₩7,900',
        currency: 'KRW',
        platform: 'android',
        type: 'subs',
        subscriptionOffers: [
            offer('monthly', 'trial-token', [phase('P1W', '0', 'Free'), phase('P1M', '7900000000', '₩7,900')]),
            offer('monthly', 'base-token', [phase('P1M', '7900000000', '₩7,900')]),
            offer('yearly', 'yearly-token', [phase('P1Y', '79000000000', '₩79,000')]),
        ],
    };

    beforeEach(() => {
        jest.clearAllMocks();
        logger = makeLogger();
        service = new SubscriptionIapService(logger, google);
    });

    it('splits a product into one entry per base plan with its trial and base offer tokens', async () => {
        fetchProductsMock.mockResolvedValue([androidProduct]);

        const plans = await service.getSubscriptions();

        expect(plans).toHaveLength(2);
        expect(plans[0]).toMatchObject({
            id: 'sku_pro',
            basePlanId: 'monthly',
            displayName: 'DoU Pro\n(monthly)',
            displayPrice: '₩7,900',
            billingPeriod: 'P1M',
            periodUnit: 'month',
            periodNumber: 1,
            androidOfferToken: { freeTrial: 'trial-token', base: 'base-token' },
        });
        expect(plans[0].subscriptionOffers).toHaveLength(2);
        expect(plans[1]).toMatchObject({
            basePlanId: 'yearly',
            periodUnit: 'year',
            androidOfferToken: { freeTrial: null, base: 'yearly-token' },
        });
    });

    it('refuses a purchase with no offer token before logging or calling the store', async () => {
        await expect(service.purchase('sku_pro')).rejects.toThrow('Require offerToken for purchasing Android');

        expect(logger.info).not.toHaveBeenCalled();
        expect(purchaseMock).not.toHaveBeenCalled();
    });

    it('sends the offer token in the Google request', async () => {
        purchaseMock.mockResolvedValue(undefined);

        await service.purchase('sku_pro', 'base-token');

        expect(purchaseMock).toHaveBeenCalledWith({
            type: 'subs',
            request: {
                apple: { sku: 'sku_pro', andDangerouslyFinishTransactionAutomatically: false },
                google: {
                    skus: ['sku_pro'],
                    subscriptionOffers: [{ sku: 'sku_pro', offerToken: 'base-token' }],
                    subscriptionProductReplacementParams: undefined,
                },
            },
        });
        expect(availableMock).not.toHaveBeenCalled();
    });

    it('replaces the current purchase on a plan change', async () => {
        purchaseMock.mockResolvedValue(undefined);
        availableMock.mockResolvedValue([{ productId: 'sku_pro', purchaseToken: 'old-token' }]);

        await service.purchase('sku_pro', 'base-token', 'plan_pro', 'plan_basic');

        const [{ request }] = purchaseMock.mock.calls[0];
        expect(request.google.subscriptionProductReplacementParams).toEqual({
            oldPurchaseToken: 'old-token',
            replacementMode: 'deferred',
        });
        expect(logger.debug).toHaveBeenCalledWith('IAP', 'Looking up existing purchase for plan change');
    });

    it('leaves the replacement unset when no current purchase matches', async () => {
        purchaseMock.mockResolvedValue(undefined);
        availableMock.mockResolvedValue([{ productId: 'other', purchaseToken: 'x' }]);

        await service.purchase('sku_pro', 'base-token', 'plan_basic', 'plan_pro');

        const [{ request }] = purchaseMock.mock.calls[0];
        expect(request.google.subscriptionProductReplacementParams).toBeUndefined();
    });

    it('sends a plain purchase and logs the error when the current purchases cannot be read', async () => {
        purchaseMock.mockResolvedValue(undefined);
        availableMock.mockRejectedValue(new Error('billing unavailable'));

        await service.purchase('sku_pro', 'base-token', 'plan_pro', 'plan_basic');

        const [{ request }] = purchaseMock.mock.calls[0];
        expect(request.google.subscriptionProductReplacementParams).toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith('IAP', 'Failed to get available purchases', expect.any(Error));
    });

    it('opens the Play subscriptions page', async () => {
        await service.linkToManageSubscriptions();

        expect(openUrlMock).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions');
    });
});

describe('replacementModeFor', () => {
    const order = ['plan_basic', 'plan_pro'];

    it('prorates an upgrade and defers a downgrade', () => {
        expect(replacementModeFor(order, 'plan_basic', 'plan_pro')).toBe('with-time-proration');
        expect(replacementModeFor(order, 'plan_pro', 'plan_basic')).toBe('deferred');
    });

    it('prorates a change between plans of equal rank, two unlisted plans included', () => {
        expect(replacementModeFor(order, 'plan_pro', 'plan_pro')).toBe('with-time-proration');
        expect(replacementModeFor(order, 'unknown', 'other')).toBe('with-time-proration');
    });

    it('ranks an unlisted plan below every listed one', () => {
        expect(replacementModeFor(order, 'plan_basic', 'unknown')).toBe('deferred');
        expect(replacementModeFor(order, 'unknown', 'plan_basic')).toBe('with-time-proration');
    });
});
