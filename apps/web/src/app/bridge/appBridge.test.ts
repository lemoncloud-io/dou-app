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

    // 링버퍼가 폐지되면서 `*AppLogBuffer` 메서드 4개가 사라졌다. 메시지 타입과
    // 앱 핸들러는 구버전 웹 호환으로 남지만 이 빌드는 부르지 않으므로, 부르지
    // 않는다는 것 자체를 고정한다.
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

    // 핸드셰이크는 단방향 알림이 아니라 capability 교환이다 — 웹이 자기보다 구버전인 앱을
    // 감지하려면 응답을 읽어야 한다(기록은 main.tsx가 한다).
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

    // 네이티브가 없는 평범한 브라우저에서는 reject가 정상이다 — 부팅을 깨선 안 된다.
    it('브릿지가 없어 요청이 실패하면 reject 대신 null이다', async () => {
        requestMock.mockRejectedValueOnce(new Error('no native bridge'));

        await expect(appBridge.notifyWebAppReady()).resolves.toBeNull();
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
