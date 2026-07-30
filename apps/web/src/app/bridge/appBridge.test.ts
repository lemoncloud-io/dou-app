import { appBridge } from './appBridge';
import { webClient } from '@chatic/bridges';

jest.mock('@chatic/bridges', () => ({
    webClient: {
        post: jest.fn(),
        request: jest.fn(),
    },
}));

const postMock = webClient.post as jest.Mock;
const requestMock = webClient.request as jest.Mock;

describe('appBridge — 네이티브 브릿지 호출', () => {
    beforeEach(() => {
        postMock.mockClear();
        requestMock.mockClear();
        // Default: request resolves so callers can await without hanging
        requestMock.mockResolvedValue({ success: true, data: {} });
    });

    it('fire-and-forget 메서드는 webClient.post를 호출한다', () => {
        appBridge.notifyWebAppReady();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'WebAppReady', data: {} });

        appBridge.dismissResumeOverlay();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'DismissResumeOverlay', data: {} });

        appBridge.openSettings();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'OpenSettings', data: {} });

        appBridge.openSubscriptionManagement();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'OpenSubscriptionManagement', data: {} });
    });

    it('단일 인수 fire-and-forget 메서드는 메시지 형태로 감싸 post를 호출한다', () => {
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
    });

    it('preference 페이로드는 post로 전달된다', () => {
        appBridge.savePreference({ key: 'language', value: 'ko' });
        expect(postMock).toHaveBeenLastCalledWith({
            type: 'SavePreference',
            data: { key: 'language', value: 'ko' },
        });
    });

    it('request-response 메서드는 webClient.request를 호출하고 Promise를 반환한다', () => {
        appBridge.fetchFcmToken();
        expect(requestMock).toHaveBeenLastCalledWith({ type: 'FetchFcmToken', data: {} });

        appBridge.oauthLogin('apple');
        expect(requestMock).toHaveBeenLastCalledWith({ type: 'OAuthLogin', data: { provider: 'apple' } });

        appBridge.getContacts();
        expect(requestMock).toHaveBeenLastCalledWith({ type: 'GetContacts', data: {} });

        appBridge.fetchCurrentPurchases();
        expect(requestMock).toHaveBeenLastCalledWith({ type: 'FetchCurrentPurchases', data: {} });
    });

    it('purchase는 push 이벤트로 결과가 오므로 post를 호출한다', () => {
        // Purchase result comes via OnPurchaseSuccess / OnPurchaseError push events, not request-response
        appBridge.purchase({ id: 'sku_1', offerToken: 'offer', newPlanId: 'plan' });
        expect(postMock).toHaveBeenLastCalledWith({
            type: 'Purchase',
            data: { id: 'sku_1', offerToken: 'offer', newPlanId: 'plan' },
        });
    });

    it('fetchProducts는 10초 timeout으로 request를 호출한다', () => {
        appBridge.fetchProducts();
        expect(requestMock).toHaveBeenLastCalledWith({ type: 'FetchProducts', data: {} }, { timeoutMs: 10_000 });
    });

    it('finishPurchaseTransaction은 purchase 객체를 포함해 request를 호출한다', () => {
        const purchaseResult = { productId: 'sku_1', purchaseToken: 'token' } as never;
        appBridge.finishPurchaseTransaction(purchaseResult);
        expect(requestMock).toHaveBeenLastCalledWith({
            type: 'FinishPurchaseTransaction',
            data: { purchase: purchaseResult },
        });
    });

    it('log-buffer 메서드는 nonce를 올바른 위치에 배치해 request를 호출한다', () => {
        appBridge.fetchAppLogBuffer('nonce-1', 20);
        expect(requestMock).toHaveBeenLastCalledWith({
            type: 'FetchAppLogBuffer',
            nonce: 'nonce-1',
            data: { count: 20 },
        });

        appBridge.pollAppLogBuffer('nonce-2', 10);
        expect(requestMock).toHaveBeenLastCalledWith({
            type: 'PollAppLogBuffer',
            nonce: 'nonce-2',
            data: { count: 10 },
        });

        appBridge.clearAppLogBuffer('nonce-3');
        expect(requestMock).toHaveBeenLastCalledWith({ type: 'ClearAppLogBuffer', data: { nonce: 'nonce-3' } });

        appBridge.fetchAppLogBufferSize('nonce-4');
        expect(requestMock).toHaveBeenLastCalledWith({ type: 'FetchAppLogBufferSize', data: { nonce: 'nonce-4' } });
    });

    it('request-response 메서드는 Promise를 반환한다', () => {
        expect(appBridge.fetchFcmToken()).toBeInstanceOf(Promise);
        expect(appBridge.oauthLogin('google')).toBeInstanceOf(Promise);
        expect(appBridge.getContacts()).toBeInstanceOf(Promise);
        expect(appBridge.fetchCurrentPurchases()).toBeInstanceOf(Promise);
        expect(appBridge.fetchProducts()).toBeInstanceOf(Promise);
    });

    it('checkAppUpdate는 request로 CheckAppUpdate를 호출하고 Promise를 반환한다', () => {
        expect(appBridge.checkAppUpdate()).toBeInstanceOf(Promise);
        expect(requestMock).toHaveBeenLastCalledWith({ type: 'CheckAppUpdate', data: {} });
    });

    it('openStore는 fire-and-forget으로 post를 호출한다', () => {
        appBridge.openStore();
        expect(postMock).toHaveBeenLastCalledWith({ type: 'OpenStore', data: {} });
    });
});
