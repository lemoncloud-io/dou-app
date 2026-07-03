import type { DeviceInfo } from '@chatic/app-messages';

import { buildDeviceInfoRows } from './buildDeviceInfoRows';

const ROW_LABELS = ['Device ID', 'Install ID', 'Platform', 'Model', 'Stage', 'Application'];

describe('buildDeviceInfoRows', () => {
    it('deviceInfo가 null이면 모든 행이 플레이스홀더로 떨어진다', () => {
        const rows = buildDeviceInfoRows(null);

        expect(rows.map(row => row.label)).toEqual(ROW_LABELS);
        expect(rows.every(row => row.value === '-' && row.copyValue === null)).toBe(true);
    });

    it('주입된 필드를 표시하고 복사값을 채운다', () => {
        const deviceInfo = {
            deviceId: 'dev-1',
            installId: 'inst-1',
            platform: 'ios',
            deviceModel: 'iPhone15',
            stage: 'dev',
            application: 'chatic',
        } as unknown as DeviceInfo;

        const byLabel = Object.fromEntries(buildDeviceInfoRows(deviceInfo).map(row => [row.label, row]));

        expect(byLabel['Device ID']).toMatchObject({ value: 'dev-1', copyValue: 'dev-1' });
        expect(byLabel['Install ID'].value).toBe('inst-1');
        expect(byLabel['Platform'].value).toBe('ios');
        expect(byLabel['Model'].value).toBe('iPhone15');
    });

    it('공백만 있거나 null인 값은 플레이스홀더로 처리한다', () => {
        const deviceInfo = { deviceId: '   ', installId: null } as unknown as DeviceInfo;

        const byLabel = Object.fromEntries(buildDeviceInfoRows(deviceInfo).map(row => [row.label, row]));

        expect(byLabel['Device ID']).toMatchObject({ value: '-', copyValue: null });
        expect(byLabel['Install ID']).toMatchObject({ value: '-', copyValue: null });
    });
});
