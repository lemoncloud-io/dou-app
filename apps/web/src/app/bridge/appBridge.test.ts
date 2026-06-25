import { appBridge } from './appBridge';
import { webClient } from '@chatic/bridges';

jest.mock('@chatic/bridges', () => ({
    webClient: {
        post: jest.fn(),
    },
}));

const postMock = webClient.post as jest.Mock;

describe('appBridge', () => {
    beforeEach(() => {
        postMock.mockClear();
    });

    it('posts fire-and-forget messages with empty payloads', () => {
        appBridge.notifyWebAppReady();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'WebAppReady', data: {} });

        appBridge.dismissResumeOverlay();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'DismissResumeOverlay', data: {} });

        appBridge.openSettings();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'OpenSettings', data: {} });

        appBridge.openSubscriptionManagement();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'OpenSubscriptionManagement', data: {} });

        appBridge.fetchFcmToken();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'FetchFcmToken', data: {} });

        appBridge.getContacts();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'GetContacts', data: {} });

        appBridge.fetchCurrentPurchases();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'FetchCurrentPurchases', data: {} });

        appBridge.fetchProducts();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'FetchProducts', data: {} });
    });

    it('wraps single-argument payloads into their message shape', () => {
        appBridge.openURL('https://example.com');
        expect(postMock).toHaveBeenLastCalledWith({ type: 'OpenURL', data: { url: 'https://example.com' } });

        appBridge.openShareSheet('https://share.example.com');
        expect(postMock).toHaveBeenLastCalledWith({
            type: 'OpenShareSheet',
            data: { url: 'https://share.example.com' },
        });

        appBridge.setBadgeCount(7);
        expect(postMock).toHaveBeenLastCalledWith({ type: 'SetBadgeCount', data: { count: 7 } });

        appBridge.setCanGoBack(true);
        expect(postMock).toHaveBeenLastCalledWith({ type: 'SetCanGoBack', data: { canGoBack: true } });

        appBridge.oauthLogin('apple');
        expect(postMock).toHaveBeenLastCalledWith({ type: 'OAuthLogin', data: { provider: 'apple' } });
    });

    it('passes through preference and purchase payloads', () => {
        appBridge.savePreference({ key: 'language', value: 'ko' });
        expect(postMock).toHaveBeenLastCalledWith({
            type: 'SavePreference',
            data: { key: 'language', value: 'ko' },
        });

        appBridge.purchase({ id: 'sku_1', offerToken: 'offer', newPlanId: 'plan' });
        expect(postMock).toHaveBeenLastCalledWith({
            type: 'Purchase',
            data: { id: 'sku_1', offerToken: 'offer', newPlanId: 'plan' },
        });

        const purchaseResult = { productId: 'sku_1', purchaseToken: 'token' } as never;
        appBridge.finishPurchaseTransaction(purchaseResult);
        expect(postMock).toHaveBeenLastCalledWith({
            type: 'FinishPurchaseTransaction',
            data: { purchase: purchaseResult },
        });
    });

    it('places the nonce where each log-buffer message expects it', () => {
        appBridge.fetchAppLogBuffer('nonce-1', 20);
        expect(postMock).toHaveBeenLastCalledWith({
            type: 'FetchAppLogBuffer',
            nonce: 'nonce-1',
            data: { count: 20 },
        });

        appBridge.pollAppLogBuffer('nonce-2', 10);
        expect(postMock).toHaveBeenLastCalledWith({
            type: 'PollAppLogBuffer',
            nonce: 'nonce-2',
            data: { count: 10 },
        });

        appBridge.clearAppLogBuffer('nonce-3');
        expect(postMock).toHaveBeenLastCalledWith({ type: 'ClearAppLogBuffer', data: { nonce: 'nonce-3' } });

        appBridge.fetchAppLogBufferSize('nonce-4');
        expect(postMock).toHaveBeenLastCalledWith({ type: 'FetchAppLogBufferSize', data: { nonce: 'nonce-4' } });
    });
});
