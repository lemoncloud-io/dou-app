import { buildInjectedUniqueId } from './buildInjectedUniqueId';

describe('buildInjectedUniqueId', () => {
    it('deviceId와 firebaseInstallId를 콜론으로 결합한다', () => {
        expect(buildInjectedUniqueId('device_1', 'fid_abc')).toBe('device_1:fid_abc');
    });

    it('firebaseInstallId가 없으면(null/undefined/공백) deviceId만 반환한다', () => {
        expect(buildInjectedUniqueId('device_1', null)).toBe('device_1');
        expect(buildInjectedUniqueId('device_1', undefined)).toBe('device_1');
        expect(buildInjectedUniqueId('device_1', '')).toBe('device_1');
        expect(buildInjectedUniqueId('device_1', '   ')).toBe('device_1');
    });

    it('deviceId가 비어 있으면 firebaseInstallId만 반환한다(앞에 콜론을 붙이지 않는다)', () => {
        expect(buildInjectedUniqueId('', 'fid_abc')).toBe('fid_abc');
    });

    it('양쪽 모두 비어 있으면 빈 문자열을 반환한다', () => {
        expect(buildInjectedUniqueId('', null)).toBe('');
    });

    it('각 조각의 앞뒤 공백은 제거하고 결합한다', () => {
        expect(buildInjectedUniqueId('  device_1 ', ' fid_abc ')).toBe('device_1:fid_abc');
    });
});
