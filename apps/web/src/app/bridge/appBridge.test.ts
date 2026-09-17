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

    // Regression pin: starting login is not a round trip that waits for a response. Reverting to
    // `request` would run into the bridge's default 15s budget against a human's Google/Apple
    // interaction time, discarding a credential that had already been issued.
    it('startOAuthLogin은 request가 아니라 post로 요청만 쏜다', () => {
        appBridge.startOAuthLogin('google');

        expect(postMock).toHaveBeenLastCalledWith({ type: 'OAuthLogin', data: { provider: 'google' } });
        expect(requestMock).not.toHaveBeenCalled();
        expect(appBridge.startOAuthLogin('google')).toBeUndefined();
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

        // Only account linking waits for the response. Since it's a human-driven flow, it doesn't use the default 15s.
        appBridge.oauthLogin('apple');
        expect(requestMock).toHaveBeenLastCalledWith(
            { type: 'OAuthLogin', data: { provider: 'apple' } },
            { timeoutMs: 180_000 }
        );

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

    // With the ring buffer retired, the four `*AppLogBuffer` methods are gone. The message types and
    // app handlers remain for older-web compatibility, but this build never calls them — this test
    // pins exactly that: they are not called.
    it('폐지된 log-buffer 메서드를 더 이상 노출하지 않는다', () => {
        expect('fetchAppLogBuffer' in appBridge).toBe(false);
        expect('pollAppLogBuffer' in appBridge).toBe(false);
        expect('clearAppLogBuffer' in appBridge).toBe(false);
        expect('fetchAppLogBufferSize' in appBridge).toBe(false);
    });

    it('sendSms는 수신자와 본문을 담아 request를 호출한다', () => {
        appBridge.sendSms('01012345678', 'invite message');
        expect(requestMock).toHaveBeenLastCalledWith({
            type: 'SendSms',
            data: { phoneNumbers: '01012345678', message: 'invite message' },
        });

        appBridge.sendSms(['01012345678', '01099998888'], 'batch message');
        expect(requestMock).toHaveBeenLastCalledWith({
            type: 'SendSms',
            data: { phoneNumbers: ['01012345678', '01099998888'], message: 'batch message' },
        });
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

    // The handshake is not a one-way notification but a capability exchange — for the web to detect
    // an app older than itself, it has to read the response (main.tsx does the recording).
    it('notifyWebAppReady는 request로 보내고 앱의 capability 응답을 돌려준다', async () => {
        const report = {
            cacheSchemaVersion: 7,
            supportedCacheTypes: ['chat', 'channel'],
            // ADR-0053: per-domain contract editions ride the same reply. Passed straight through —
            // main.tsx hands the whole payload to setNativeCacheSupport.
            cacheDomainVersions: { chat: 1, channel: 1 },
        };
        requestMock.mockResolvedValueOnce({ success: true, data: report });

        await expect(appBridge.notifyWebAppReady()).resolves.toEqual(report);
        expect(requestMock).toHaveBeenLastCalledWith({ type: 'WebAppReady', data: {} });
    });

    // On a plain browser with no native bridge, a reject is expected — it must not break boot.
    it('브릿지가 없어 요청이 실패하면 reject 대신 null이다', async () => {
        requestMock.mockRejectedValueOnce(new Error('no native bridge'));

        await expect(appBridge.notifyWebAppReady()).resolves.toBeNull();
    });

    describe('config 셸 레인 (ADR-0079 결정 9)', () => {
        it('saveConfigValueConfirmed/clearConfigValueConfirmed/deletePreferenceConfirmed는 request로 호출된다', () => {
            appBridge.saveConfigValueConfirmed({ key: 'ui.theme', value: '"dark"' });
            expect(requestMock).toHaveBeenLastCalledWith({
                type: 'SaveConfigValue',
                data: { key: 'ui.theme', value: '"dark"' },
            });

            appBridge.clearConfigValueConfirmed({ key: 'ui.theme' });
            expect(requestMock).toHaveBeenLastCalledWith({ type: 'ClearConfigValue', data: { key: 'ui.theme' } });

            appBridge.deletePreferenceConfirmed({ key: 'theme' });
            expect(requestMock).toHaveBeenLastCalledWith({ type: 'DeletePreference', data: { key: 'theme' } });
        });
    });

    describe('fetchPushMarks (ADR-0056)', () => {
        it('request로 FetchPushMarks를 호출하고 marks 배열을 반환한다', async () => {
            requestMock.mockResolvedValueOnce({ success: true, data: { marks: [{ cid: 'cloud_1' }] } });

            await expect(appBridge.fetchPushMarks()).resolves.toEqual([{ cid: 'cloud_1' }]);
            expect(requestMock).toHaveBeenLastCalledWith({ type: 'FetchPushMarks', data: {} });
        });

        it('구버전 셸/평범한 브라우저에서 요청이 실패하면 빈 배열이다', async () => {
            requestMock.mockRejectedValueOnce(new Error('no native bridge'));

            await expect(appBridge.fetchPushMarks()).resolves.toEqual([]);
        });
    });
});
