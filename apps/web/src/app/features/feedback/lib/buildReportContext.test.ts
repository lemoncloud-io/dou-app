import type { DeviceInfo, VersionInfo } from '@chatic/app-messages';

import { recordRoute, resetRouteTrail } from '../../../utils/routeTrail';
import { buildReportContext } from './buildReportContext';

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

    // 로그는 배치 업로더가 낱건으로 서버에 올린다. 제보에 사본을 붙이면 같은 로그가
    // 두 번 저장되고, 그 사본만 공유 Slack 채널로도 나간다.
    it('로그는 첨부하지 않는다', () => {
        const ctx = buildReportContext({ deviceInfo: device, versionInfo: version });
        expect(ctx).not.toHaveProperty('logs');
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
