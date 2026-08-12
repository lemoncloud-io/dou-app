import { logBuffer } from '@chatic/logger';

import { attachNativeLoggerBridge } from './nativeLoggerBridge';

const listeners = new Map<string, (payload: unknown) => void>();
const mockReady = jest.fn();
const mockRemove = jest.fn();
let nativeModuleAvailable = true;

jest.mock('react-native', () => ({
    NativeModules: {
        get ChaticNativeLogger() {
            return nativeModuleAvailable ? { ready: mockReady } : undefined;
        },
    },
    NativeEventEmitter: class {
        addListener(event: string, handler: (payload: unknown) => void) {
            listeners.set(event, handler);
            return { remove: mockRemove };
        }
    },
}));

describe('attachNativeLoggerBridge', () => {
    beforeEach(() => {
        listeners.clear();
        mockReady.mockClear();
        mockRemove.mockClear();
        nativeModuleAvailable = true;
    });

    afterEach(() => {
        logBuffer.clear();
    });

    it('구독 후 ready를 호출하고, 이벤트를 source:native로 코어에 적재한다', () => {
        const teardown = attachNativeLoggerBridge();

        expect(mockReady).toHaveBeenCalledTimes(1);
        listeners.get('ChaticNativeLog')?.({
            level: 'error',
            tag: 'ChaticPushService',
            message: 'push failed',
            timestamp: 777,
            error: 'java.lang.Exception: boom',
        });

        const [entry] = logBuffer.peek();
        expect(entry).toMatchObject({
            level: 'error',
            tag: 'ChaticPushService',
            message: 'push failed',
            timestamp: 777,
            source: 'native',
            error: 'java.lang.Exception: boom',
        });
        teardown();
        expect(mockRemove).toHaveBeenCalled();
    });

    it('필드가 빠지거나 미지의 level이면 안전한 기본값으로 정규화한다', () => {
        attachNativeLoggerBridge();
        const before = Date.now();

        listeners.get('ChaticNativeLog')?.({ level: 'verbose' });

        const [entry] = logBuffer.peek();
        expect(entry.level).toBe('info');
        expect(entry.tag).toBe('NATIVE');
        expect(entry.message).toBe('');
        expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('네이티브 모듈이 없으면(테스트·미탑재 빌드) no-op으로 강등된다', () => {
        nativeModuleAvailable = false;

        const teardown = attachNativeLoggerBridge();

        expect(mockReady).not.toHaveBeenCalled();
        expect(() => teardown()).not.toThrow();
    });
});
