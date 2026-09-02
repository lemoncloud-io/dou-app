import { renderHook } from '@testing-library/react';

const mockUseSessionDeviceId = jest.fn();

jest.mock('@chatic/shared', () => ({
    useSessionDeviceId: (...args: unknown[]) => mockUseSessionDeviceId(...args),
}));

const { useDynamicDeviceId } = require('./useDynamicDeviceId');

describe('useDynamicDeviceId — 소켓/푸시 공용 디바이스 id 단일 해석', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete window.CHATIC_APP_DEVICE_ID;
        delete window.CHATIC_APP_UNIQUE_DEVICE_ID;
        delete window.CHATIC_APP_FIREBASE_INSTALLATION_ID;
        mockUseSessionDeviceId.mockReturnValue({ deviceId: 'session-1' });
    });

    it('신규 앱이 주입한 UNIQUE_DEVICE_ID를 최우선으로 사용한다', () => {
        window.CHATIC_APP_UNIQUE_DEVICE_ID = 'bare-1';
        window.CHATIC_APP_DEVICE_ID = 'bare-1:fid-1';

        const { result } = renderHook(() => useDynamicDeviceId());

        expect(result.current.deviceId).toBe('bare-1');
    });

    it('복합 DEVICE_ID(bare:firebaseId)에서는 콜론 앞의 순수 id를 파생한다', () => {
        // Legacy shells (<= 0.15.x, 0.17.x) inject the composite form; the bare
        // prefix is the only reinstall-stable part.
        window.CHATIC_APP_DEVICE_ID = 'bare-1:fid-1';

        const { result } = renderHook(() => useDynamicDeviceId());

        expect(result.current.deviceId).toBe('bare-1');
    });

    it('콜론 없는 DEVICE_ID(0.16.x 앱)는 이미 순수 id이므로 그대로 사용한다', () => {
        window.CHATIC_APP_DEVICE_ID = 'bare-only';

        const { result } = renderHook(() => useDynamicDeviceId());

        expect(result.current.deviceId).toBe('bare-only');
    });

    it('주입 글로벌이 없으면(순수 웹) 세션 스토리지 id로 폴백한다', () => {
        const { result } = renderHook(() => useDynamicDeviceId());

        expect(result.current.deviceId).toBe('session-1');
        expect(mockUseSessionDeviceId).toHaveBeenCalledWith('chatic-device-id');
    });

    it('빈 문자열로 주입된 DEVICE_ID는 무시하고 세션 id로 폴백한다', () => {
        window.CHATIC_APP_DEVICE_ID = '';

        const { result } = renderHook(() => useDynamicDeviceId());

        expect(result.current.deviceId).toBe('session-1');
    });

    it('firebase id는 신규 글로벌 FIREBASE_INSTALLATION_ID를 최우선으로 사용한다', () => {
        window.CHATIC_APP_FIREBASE_INSTALLATION_ID = 'fid-new';
        window.CHATIC_APP_DEVICE_ID = 'bare-1:fid-legacy';

        const { result } = renderHook(() => useDynamicDeviceId());

        expect(result.current.firebaseInstallationId).toBe('fid-new');
    });

    it('신규 글로벌이 없으면 복합 DEVICE_ID의 [1]에서 firebase id를 파생한다', () => {
        window.CHATIC_APP_DEVICE_ID = 'bare-1:fid-legacy';

        const { result } = renderHook(() => useDynamicDeviceId());

        expect(result.current.firebaseInstallationId).toBe('fid-legacy');
    });

    it('콜론 없는 DEVICE_ID(0.16.x 앱)에서는 firebase id가 undefined다', () => {
        window.CHATIC_APP_DEVICE_ID = 'bare-only';

        const { result } = renderHook(() => useDynamicDeviceId());

        expect(result.current.firebaseInstallationId).toBeUndefined();
    });

    it('주입 글로벌이 없으면(순수 웹) firebase id는 undefined다', () => {
        const { result } = renderHook(() => useDynamicDeviceId());

        expect(result.current.firebaseInstallationId).toBeUndefined();
    });
});
