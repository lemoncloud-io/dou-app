import type { LogEntry } from '@chatic/logger';
import type { PendingReportInfo } from '@chatic/app-messages';
import { checkCrashOnPreviousExecution, installNativeErrorDetection } from './nativeErrorDetection';
import type { NativeErrorDetectionDeps } from './nativeErrorDetection';

const didCrashOnPreviousExecution = jest.fn();

jest.mock('@react-native-firebase/crashlytics', () => ({
    __esModule: true,
    default: () => ({
        didCrashOnPreviousExecution: () => didCrashOnPreviousExecution(),
    }),
}));

type EnqueueArg = Omit<PendingReportInfo, 'id'>;

const createDeps = (bufferEntries: LogEntry[] = []) => {
    const enqueued: EnqueueArg[] = [];
    const deps: NativeErrorDetectionDeps = {
        logService: {
            subscribe: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        logBufferService: {
            init: jest.fn(),
            teardown: jest.fn(),
            getSize: () => bufferEntries.length,
            peek: () => bufferEntries,
            poll: jest.fn(),
            clear: jest.fn(),
        } as any,
        pendingReports: {
            enqueue: (report: EnqueueArg) => {
                enqueued.push(report);
            },
            list: () => [],
            ack: () => 0,
            size: () => enqueued.length,
        },
    };
    return { deps, enqueued };
};

const entry = (message: string, timestamp: number): LogEntry => ({
    level: 'info',
    tag: 'APP',
    message,
    timestamp,
});

describe('installNativeErrorDetection', () => {
    afterEach(() => {
        delete (globalThis as any).ErrorUtils;
        delete (globalThis as any).HermesInternal;
    });

    it('전역 예외를 로깅 후 native-error로 큐잉하고 기존 핸들러 체인을 보존한다', () => {
        const previous = jest.fn();
        (globalThis as any).ErrorUtils = {
            getGlobalHandler: () => previous,
            setGlobalHandler: jest.fn(),
        };
        const { deps, enqueued } = createDeps([entry('breadcrumb', 1)]);

        installNativeErrorDetection(deps);
        const installed = ((globalThis as any).ErrorUtils.setGlobalHandler as jest.Mock).mock.calls[0][0];
        const boom = new Error('boom');
        installed(boom, true);

        expect(deps.logService.error).toHaveBeenCalledWith('GLOBAL', '[native-error] boom', boom);
        expect(enqueued).toHaveLength(1);
        expect(enqueued[0]).toMatchObject({
            category: 'native-error',
            message: 'boom',
            extra: { isFatal: true },
        });
        expect(enqueued[0].logs?.map(l => l.message)).toEqual(['breadcrumb']);
        expect(typeof enqueued[0].stack).toBe('string');
        expect(previous).toHaveBeenCalledWith(boom, true);
    });

    it('Hermes 트래커가 있으면 미처리 Promise 거부를 native-error로 큐잉한다', () => {
        const enableTracker = jest.fn();
        (globalThis as any).HermesInternal = { enablePromiseRejectionTracker: enableTracker };
        const { deps, enqueued } = createDeps();

        installNativeErrorDetection(deps);
        const config = enableTracker.mock.calls[0][0];
        config.onUnhandled(1, new Error('rejected'));

        expect(enqueued).toHaveLength(1);
        expect(enqueued[0]).toMatchObject({
            category: 'native-error',
            message: 'rejected',
            extra: { unhandledRejection: true },
        });
    });
});

describe('checkCrashOnPreviousExecution', () => {
    beforeEach(() => {
        didCrashOnPreviousExecution.mockReset();
    });

    it('직전 실행이 크래시였으면 복원된 버퍼 tail을 붙여 native-crash를 큐잉한다', async () => {
        didCrashOnPreviousExecution.mockResolvedValue(true);
        const { deps, enqueued } = createDeps([entry('old-1', 10), entry('old-2', 20)]);

        await checkCrashOnPreviousExecution(deps);

        expect(enqueued).toHaveLength(1);
        expect(enqueued[0]).toMatchObject({ category: 'native-crash', detectedAt: 20 });
        expect(enqueued[0].logs?.map(l => l.message)).toEqual(['old-1', 'old-2']);
    });

    it('크래시가 아니면 아무것도 큐잉하지 않는다', async () => {
        didCrashOnPreviousExecution.mockResolvedValue(false);
        const { deps, enqueued } = createDeps();

        await checkCrashOnPreviousExecution(deps);

        expect(enqueued).toHaveLength(0);
    });

    it('Crashlytics 체크가 실패해도 던지지 않는다', async () => {
        didCrashOnPreviousExecution.mockRejectedValue(new Error('unavailable'));
        const { deps, enqueued } = createDeps();

        await expect(checkCrashOnPreviousExecution(deps)).resolves.toBeUndefined();
        expect(enqueued).toHaveLength(0);
        expect(deps.logService.warn).toHaveBeenCalled();
    });
});
