import { NonNativeFailBridgeClient } from './NonNativeFailBridgeClient';
describe('NonNativeFailBridgeClient Exception Policy', () => {
    let mockWarn: jest.SpyInstance;
    let mockError: jest.SpyInstance;
    beforeEach(() => {
        mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => {
            /* empty */
        });
        mockError = jest.spyOn(console, 'error').mockImplementation(() => {
            /* empty */
        });
    });
    afterEach(() => {
        mockWarn.mockRestore();
        mockError.mockRestore();
    });
    it('should reject request and send calls with NATIVE_NOT_SUPPORTED error', async () => {
        const client = new NonNativeFailBridgeClient();
        await expect(client.request({ type: 'FetchSafeArea', data: {} })).rejects.toEqual(
            expect.objectContaining({
                code: 'NATIVE_NOT_SUPPORTED',
                message: '일반 브라우저 환경에서는 네이티브 브릿지 기능을 사용할 수 없습니다.',
                requestType: 'FetchSafeArea',
                recoverable: true,
            })
        );
        expect(mockError).toHaveBeenCalled();
    });
    it('should ignore post calls and log a warning', () => {
        const client = new NonNativeFailBridgeClient();
        expect(() => {
            client.post({ type: 'SetCanGoBack', data: { canGoBack: true } });
        }).not.toThrow();
        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('post [SetCanGoBack] 호출이 무시되었습니다.'));
    });
    it('should support object-style calls in mock mode', async () => {
        const client = new NonNativeFailBridgeClient();
        expect(() => {
            client.post({ type: 'SetCanGoBack', data: { canGoBack: true } } as any);
        }).not.toThrow();
        await expect(client.request({ type: 'FetchSafeArea', data: {} } as any)).rejects.toEqual(
            expect.objectContaining({
                code: 'NATIVE_NOT_SUPPORTED',
                requestType: 'FetchSafeArea',
                protocolVersion: 'non-native',
            })
        );
        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('post [SetCanGoBack] 호출이 무시되었습니다.'));
        expect(mockError).toHaveBeenCalledWith(
            expect.stringContaining('request [FetchSafeArea] 호출 실패: NATIVE_NOT_SUPPORTED')
        );
    });
    it('should return a dummy cleanup function for onEvent and log a warning', () => {
        const client = new NonNativeFailBridgeClient();
        let unsubscribe: any;
        expect(() => {
            unsubscribe = client.onEvent('OnBackPressed' as any, () => {
                /* empty */
            });
        }).not.toThrow();
        expect(unsubscribe).toBeInstanceOf(Function);
        expect(() => unsubscribe()).not.toThrow();
        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('onEvent [OnBackPressed] 구독이 설정되었으나'));
    });
});
