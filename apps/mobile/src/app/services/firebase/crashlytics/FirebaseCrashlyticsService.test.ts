import { REDACTED } from '@chatic/logger';
import type { LogEntry, LogListener } from '@chatic/logger';

import { FirebaseCrashlyticsService } from './FirebaseCrashlyticsService';
import { NATIVE_RUN_ID } from '../../log/native/nativeLogContext';

import type { ILogService } from '../../log';

const setAttribute = jest.fn();
const setAttributes = jest.fn();
const crashlyticsLog = jest.fn();
const recordError = jest.fn();
const setCrashlyticsCollectionEnabled = jest.fn();

jest.mock('@react-native-firebase/crashlytics', () => ({
    __esModule: true,
    default: () => ({
        setCrashlyticsCollectionEnabled: (...args: unknown[]) => setCrashlyticsCollectionEnabled(...args),
        setAttribute: (...args: unknown[]) => setAttribute(...args),
        setAttributes: (...args: unknown[]) => setAttributes(...args),
        log: (...args: unknown[]) => crashlyticsLog(...args),
        recordError: (...args: unknown[]) => recordError(...args),
    }),
}));

// `react-native` itself ships untransformed ESM, and both this service and
// nativeLogContext reach it through DeviceInfo/Platform.
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('react-native-device-info', () => ({
    __esModule: true,
    default: {
        getUniqueId: async () => 'device-1',
        getVersion: () => '1.0.0',
        getBuildNumber: () => '1',
        getSystemVersion: () => '17.0',
        getDeviceId: () => 'iPhone15,2',
    },
}));
// The utils barrel reaches react-native-config/localize, which are untransformed too.
jest.mock('../../../utils', () => ({ getUserAgent: async () => 'test-ua' }));

const entry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    level: 'info',
    tag: 'TEST',
    message: 'hello',
    timestamp: 1_700_000_000_000,
    ...overrides,
});

/** Starts the service and hands back the listener it registered on the hub. */
const startService = (): LogListener => {
    let listener: LogListener | undefined;
    const logService = {
        subscribe: jest.fn((fn: LogListener) => {
            listener = fn;
            return () => undefined;
        }),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as ILogService;

    new FirebaseCrashlyticsService(logService).init();
    if (!listener) throw new Error('service did not subscribe');
    return listener;
};

describe('FirebaseCrashlyticsService', () => {
    beforeEach(() => jest.clearAllMocks());

    it('tags the session with the run id so a crash can be matched to its uploaded logs', () => {
        startService();

        expect(setAttribute).toHaveBeenCalledWith('run_id', NATIVE_RUN_ID);
    });

    it('sets the run id eagerly in init, before the async identity setup', () => {
        startService();

        // setupUser awaits DeviceInfo; a crash in that window must already be
        // tagged, so the attribute cannot wait for it.
        expect(setAttribute).toHaveBeenCalledTimes(1);
    });

    it('masks sensitive data in the breadcrumb line', () => {
        const listener = startService();

        listener(entry({ data: { accessToken: 'secret-value', userId: 'u1' } }));

        const line = crashlyticsLog.mock.calls[0][0] as string;
        expect(line).not.toContain('secret-value');
        expect(line).toContain(REDACTED);
        expect(line).toContain('u1');
    });

    it('masks sensitive data in the error attributes', () => {
        const listener = startService();

        listener(entry({ level: 'error', tag: 'AUTH', message: 'login failed', data: { password: 'hunter2' } }));

        expect(setAttributes).toHaveBeenCalledWith(
            expect.objectContaining({ error_tag: 'AUTH', error_message: 'login failed', password: REDACTED })
        );
    });

    it('flattens non-string attribute values instead of passing objects through', () => {
        const listener = startService();

        listener(entry({ level: 'error', data: { status: 500, detail: { reason: 'upstream' } } }));

        const attributes = setAttributes.mock.calls[0][0] as Record<string, string>;
        expect(attributes.status).toBe('500');
        expect(attributes.detail).toBe('{"reason":"upstream"}');
    });

    it('ignores a non-object data payload rather than spreading its indices', () => {
        const listener = startService();

        listener(entry({ level: 'error', data: ['a', 'b'] }));

        const attributes = setAttributes.mock.calls[0][0] as Record<string, string>;
        expect(Object.keys(attributes)).toEqual(['error_tag', 'error_message']);
    });

    it('records an error only for error-level entries', () => {
        const listener = startService();

        listener(entry({ level: 'warn' }));
        expect(recordError).not.toHaveBeenCalled();

        listener(entry({ level: 'error' }));
        expect(recordError).toHaveBeenCalledTimes(1);
    });

    // `debug` is console-only by design. Crashlytics keeps ~64KB of custom log
    // per session and evicts oldest-first, so one debug per HTTP request
    // (withNetworkLog) would spend the whole budget on request noise and push
    // out the lines just before the crash.
    it('drops debug entries instead of spending the breadcrumb budget on them', () => {
        const listener = startService();

        listener(entry({ level: 'debug', message: 'GET /channels' }));

        expect(crashlyticsLog).not.toHaveBeenCalled();
    });

    it('still breadcrumbs every level above debug', () => {
        const listener = startService();

        listener(entry({ level: 'info' }));
        listener(entry({ level: 'warn' }));
        listener(entry({ level: 'error' }));

        expect(crashlyticsLog).toHaveBeenCalledTimes(3);
    });
});
