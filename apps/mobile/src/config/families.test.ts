import { foregroundAPNsCopy } from '@chatic/push-mobile';

import { pushCopy, signInOptions, storeCheckout } from './families';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, Linking: { openURL: jest.fn() } }));
jest.mock('react-native-config', () => ({
    __esModule: true,
    default: {
        VITE_SUBSCRIPTION_IAP_SKUS_IOS: ' sku_ios_pro , ,sku_ios_max',
        VITE_SUBSCRIPTION_IAP_SKUS_ANDROID: 'sku_android',
        VITE_SUBSCRIPTION_IAP_PLANS_ANDROID: 'plan_basic,plan_pro',
        VITE_GOOGLE_WEB_CLIENT_ID: 'web-client-id',
    },
}));
jest.mock('@react-native-firebase/messaging', () => ({
    __esModule: true,
    default: jest.fn(),
    AuthorizationStatus: {},
}));
jest.mock('@notifee/react-native', () => ({ __esModule: true, default: {}, AndroidImportance: {} }));
jest.mock('@react-native-community/push-notification-ios', () => ({ __esModule: true, default: {} }));
jest.mock('react-native-iap', () => ({}));
jest.mock('../app/bridge', () => ({ BadgeSyncBridge: { setBase: jest.fn() } }));
let mockLanguage = 'ko';
jest.mock('../app/utils', () => ({
    t: (key: string) => key,
    getEffectiveLanguage: () => mockLanguage,
    formatPushCopy: jest.requireActual('../app/utils/i18n/formatPushCopy').formatPushCopy,
}));

describe('storeCheckout', () => {
    it('picks the Google strategy on Android with its SKUs and plan order', async () => {
        const store = storeCheckout('android');
        const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
        const currentPurchases = async () => [{ productId: 'sku_android', purchaseToken: 'old' }] as never;

        const request = await store.purchaseRequest(
            { id: 'sku_android', offerToken: 'token', oldPlanId: 'plan_pro', newPlanId: 'plan_basic' },
            { logger, currentPurchases }
        );

        expect(store.store).toBe('google');
        expect(store.skus).toEqual(['sku_android']);
        expect(request.google?.subscriptionProductReplacementParams).toEqual({
            oldPurchaseToken: 'old',
            replacementMode: 'deferred',
        });
    });

    it('picks the Apple strategy on iOS with the trimmed SKU list', () => {
        const store = storeCheckout('ios');

        expect(store.store).toBe('apple');
        expect(store.skus).toEqual(['sku_ios_pro', 'sku_ios_max']);
    });
});

describe('signInOptions', () => {
    it('hands sign-in the Google web client id from the build env', () => {
        expect(signInOptions()).toEqual({ googleWebClientId: 'web-client-id' });
    });
});

describe('pushCopy channel names', () => {
    it('reads each channel name from the shell translations', () => {
        expect(pushCopy.channelName('chat')).toBe('notification.channel.chat');
        expect(pushCopy.channelName('cloud')).toBe('notification.channel.cloud');
    });
});

describe('pushCopy — foreground APNs copy in the shell language', () => {
    beforeEach(() => {
        mockLanguage = 'ko';
    });

    it('builds an attachment body from loc_key and loc_args in the shell language', () => {
        const data = {
            loc_key: 'push_chat_images_body',
            loc_args: ['3'],
            title_loc_key: 'push_chat_message_title',
            title_loc_args: ['Raine'],
        };

        expect(foregroundAPNsCopy(data, 'chat', '', pushCopy.localize)).toEqual({
            title: 'Raine',
            body: '사진 3장을 보냈습니다',
        });

        mockLanguage = 'en';
        expect(foregroundAPNsCopy(data, 'chat', '', pushCopy.localize)).toEqual({
            title: 'Raine',
            body: 'Sent 3 photos',
        });
    });

    it('shows the fallback copy for a text key that arrived without its arg', () => {
        expect(foregroundAPNsCopy({ loc_key: 'push_chat_message_body' }, 'Raine', '', pushCopy.localize).body).toBe(
            '새 메시지'
        );
    });

    it('keeps the APNs alert for a payload with no loc keys', () => {
        expect(foregroundAPNsCopy({}, 'Test title', 'Test body', pushCopy.localize)).toEqual({
            title: 'Test title',
            body: 'Test body',
        });
    });

    it('keeps the APNs alert title when the title template formats to nothing', () => {
        expect(
            foregroundAPNsCopy({ title_loc_key: 'push_chat_message_title' }, 'chat', 'x', pushCopy.localize).title
        ).toBe('chat');
    });

    it('leaves a silent push without copy', () => {
        const data = {
            loc_key: 'push_chat_image_body',
            title_loc_key: 'push_chat_message_title',
            title_loc_args: ['Raine'],
        };

        expect(foregroundAPNsCopy({ ...data, silent: true }, undefined, undefined, pushCopy.localize)).toEqual({
            title: undefined,
            body: undefined,
        });
        expect(foregroundAPNsCopy({ ...data, silent: 'true' }, undefined, undefined, pushCopy.localize)).toEqual({
            title: undefined,
            body: undefined,
        });
        expect(foregroundAPNsCopy({ ...data, silent: false }, undefined, undefined, pushCopy.localize).body).toBe(
            '사진을 보냈습니다'
        );
    });

    it('reads the camelCase aliases the extension also accepts', () => {
        const data = { bodyLocKey: 'push_chat_files_body', bodyLocArgs: '["2"]' };

        expect(foregroundAPNsCopy(data, 'Raine', '', pushCopy.localize).body).toBe('파일 2개를 보냈습니다');
    });
});
