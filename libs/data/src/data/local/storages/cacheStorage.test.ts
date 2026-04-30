import { createIndexedDBAdapter } from './indexedDBAdapter';
import { createNativeDBAdapter } from './nativeDBAdapter';
import { createStorageAdapter, isNativeApp } from './cacheStorage';

jest.mock('./indexedDBAdapter', () => ({
    createIndexedDBAdapter: jest.fn(() => ({ kind: 'indexeddb' })),
}));

jest.mock('./nativeDBAdapter', () => ({
    createNativeDBAdapter: jest.fn(() => ({ kind: 'native' })),
}));

describe('cacheStorage', () => {
    afterEach(() => {
        delete window.ReactNativeWebView;
        jest.clearAllMocks();
    });

    it('should detect native app by ReactNativeWebView presence', () => {
        expect(isNativeApp()).toBe(false);

        // 브릿지 객체가 있으면 web이 아니라 native app 내부로 간주한다.
        window.ReactNativeWebView = { postMessage: jest.fn() };

        expect(isNativeApp()).toBe(true);
    });

    it('should create indexedDB adapter in web environment', () => {
        // 일반 브라우저 환경에서는 웹 캐시 구현체로 라우팅되어야 한다.
        const adapter = createStorageAdapter('chat', 'cloud-web');

        expect(createIndexedDBAdapter).toHaveBeenCalledWith('chat', 'cloud-web');
        expect(createNativeDBAdapter).not.toHaveBeenCalled();
        expect(adapter).toEqual({ kind: 'indexeddb' });
    });

    it('should create native adapter in native environment', () => {
        // 앱 브릿지가 있으면 앱 쪽 로컬 저장소를 쓰는 native adapter를 선택해야 한다.
        window.ReactNativeWebView = { postMessage: jest.fn() };

        const adapter = createStorageAdapter('chat', 'cloud-native');

        expect(createNativeDBAdapter).toHaveBeenCalledWith('chat', 'cloud-native');
        expect(createIndexedDBAdapter).not.toHaveBeenCalled();
        expect(adapter).toEqual({ kind: 'native' });
    });
});
