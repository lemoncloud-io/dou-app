import type { LogEntry } from '@chatic/bridges';
import type { DeviceInfo, VersionInfo } from '@chatic/app-messages';

// Only the log buffer is faked. serializeLogs stays REAL (bridges re-exports it from
// @chatic/logger) so the assertions below exercise actual serialization — a stub would make the
// ordering/budget expectations vacuous. Requiring @chatic/logger rather than @chatic/bridges keeps
// the bridge's web/app/provider surface out of the test.
jest.mock('@chatic/bridges', () => ({
    logBuffer: { peek: jest.fn(() => [] as LogEntry[]) },
    serializeLogs: jest.requireActual('@chatic/logger').serializeLogs,
}));

import { logBuffer } from '@chatic/bridges';

import { recordRoute, resetRouteTrail } from '../../../utils/routeTrail';
import { RECENT_LOG_COUNT, buildReportContext } from './buildReportContext';

const mockPeek = logBuffer.peek as jest.Mock;

const makeEntry = (i: number): LogEntry => ({
    level: 'info',
    tag: 'T',
    message: `log-${i}`,
    timestamp: i,
});

const device = {
    platform: 'ios',
    application: 'chatic',
    stage: 'prod',
    deviceModel: 'iPhone',
    lang: 'ko',
    uniqueDeviceId: 'uniq-1',
    // Sensitive fields that must NOT be forwarded to the report channel:
    deviceToken: 'fcm-secret-token',
    deviceId: 'legacy-id',
    firebaseInstallationId: 'fb-1',
    installId: 'inst-1',
} as unknown as DeviceInfo;
const version = { appVersion: '1.2.3', webVersion: '0.43.0' } as unknown as VersionInfo;

describe('buildReportContext — 컨텍스트 조합', () => {
    beforeEach(() => {
        mockPeek.mockReset();
        mockPeek.mockReturnValue([]);
        resetRouteTrail();
    });

    it('진단용 device 필드만 담고 online/viewport/path/version을 포함한다', () => {
        const ctx = buildReportContext({ deviceInfo: device, versionInfo: version });
        expect(ctx.device).toEqual({
            platform: 'ios',
            application: 'chatic',
            stage: 'prod',
            deviceModel: 'iPhone',
            lang: 'ko',
            uniqueDeviceId: 'uniq-1',
        });
        expect(ctx.version).toEqual(version);
        expect(typeof ctx.online).toBe('boolean');
        expect(ctx.viewport).toEqual({ width: window.innerWidth, height: window.innerHeight });
        expect(ctx.path).toBe(window.location.pathname);
    });

    it('푸시 토큰·영구 식별자 같은 민감 device 필드는 전송하지 않는다', () => {
        const ctx = buildReportContext({ deviceInfo: device, versionInfo: null });
        const dev = ctx.device as Record<string, unknown>;
        expect(dev.deviceToken).toBeUndefined();
        expect(dev.deviceId).toBeUndefined();
        expect(dev.firebaseInstallationId).toBeUndefined();
        expect(dev.installId).toBeUndefined();
    });

    it('device/version이 null이면 undefined로 둔다', () => {
        const ctx = buildReportContext({ deviceInfo: null, versionInfo: null });
        expect(ctx.device).toBeUndefined();
        expect(ctx.version).toBeUndefined();
    });

    it('버퍼가 50개를 넘으면 가장 최근(끝) 50개만 담는다', () => {
        const entries = Array.from({ length: 120 }, (_, i) => makeEntry(i));
        mockPeek.mockReturnValue(entries);

        const ctx = buildReportContext({ deviceInfo: null, versionInfo: null });

        expect(ctx.logs).toHaveLength(RECENT_LOG_COUNT);
        // Newest tail: last entry should be log-119, first of the slice log-70.
        const logs = ctx.logs as { message: string }[];
        expect(logs[0].message).toBe('log-70');
        expect(logs[logs.length - 1].message).toBe('log-119');
    });

    it('peek는 전체(count 없이) 호출해 tail을 취한다', () => {
        buildReportContext({ deviceInfo: null, versionInfo: null });
        expect(mockPeek).toHaveBeenCalledWith();
    });

    it('최근 방문 경로 트레일을 담는다 — path만으로는 제보 시점 화면을 알 수 없다', () => {
        recordRoute('/');
        recordRoute('/channels/abc');
        recordRoute('/mypage');
        recordRoute('/mypage/feedback');

        const ctx = buildReportContext({ deviceInfo: null, versionInfo: null });

        expect(ctx.routeTrail).toEqual(['/', '/channels/abc', '/mypage', '/mypage/feedback']);
    });

    it('트레일이 비어 있으면 필드를 아예 싣지 않는다', () => {
        const ctx = buildReportContext({ deviceInfo: null, versionInfo: null });
        expect(ctx.routeTrail).toBeUndefined();
    });
});
