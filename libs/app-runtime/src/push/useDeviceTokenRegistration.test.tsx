import { act, renderHook } from '@testing-library/react';

import { useRegisterDeviceTokenMutation } from '../data/hooks';
import { useDynamicDeviceId, useSessionAuth } from '../session';

import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';
import type { DeviceTokenDelegate } from './useDeviceTokenRegistration';

jest.mock('../session', () => ({
    useSessionAuth: jest.fn(),
    useDynamicDeviceId: jest.fn(),
}));
jest.mock('../data/hooks', () => ({
    useRegisterDeviceTokenMutation: jest.fn(),
}));

const mockUseSessionAuth = useSessionAuth as jest.Mock;
const mockUseDynamicDeviceId = useDynamicDeviceId as jest.Mock;
const mockUseRegisterMutation = useRegisterDeviceTokenMutation as jest.Mock;

const mockMutateAsync = jest.fn();
const mockFetchDeviceToken = jest.fn();

let nowMs = 0;

const makeDelegate = (overrides: Partial<DeviceTokenDelegate> = {}): DeviceTokenDelegate => ({
    fetchDeviceToken: mockFetchDeviceToken,
    platform: 'ios',
    installId: 'install-1',
    ...overrides,
});

// Flush the fetch → register promise chain started inside the hook.
const flush = () =>
    act(async () => {
        await Promise.resolve();
    });

const setAuthenticated = (isAuthenticated: boolean) => mockUseSessionAuth.mockReturnValue({ isAuthenticated });

beforeEach(() => {
    jest.clearAllMocks();
    nowMs = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    setAuthenticated(true);
    mockUseDynamicDeviceId.mockReturnValue({ deviceId: 'device-1', firebaseInstallationId: 'fid-dyn', isReady: true });
    mockUseRegisterMutation.mockReturnValue({ mutateAsync: mockMutateAsync });
    mockMutateAsync.mockResolvedValue({});
    mockFetchDeviceToken.mockResolvedValue('tok-1');
});

afterEach(() => {
    (Date.now as jest.Mock).mockRestore();
});

describe('useDeviceTokenRegistration — 공용 디바이스 토큰 등록', () => {
    it('delegate가 null이면 아무것도 하지 않는다', async () => {
        renderHook(() => useDeviceTokenRegistration(null));
        await flush();

        expect(mockFetchDeviceToken).not.toHaveBeenCalled();
        expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('미인증 상태에서는 토큰을 가져오지 않는다', async () => {
        setAuthenticated(false);

        renderHook(() => useDeviceTokenRegistration(makeDelegate()));
        await flush();

        expect(mockFetchDeviceToken).not.toHaveBeenCalled();
        expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('인증되면 최신 토큰을 받아 force로 등록한다', async () => {
        renderHook(() => useDeviceTokenRegistration(makeDelegate()));
        await flush();

        expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);
        expect(mockMutateAsync).toHaveBeenCalledWith({
            deviceId: 'device-1',
            deviceToken: 'tok-1',
            platform: 'ios',
            installId: 'install-1',
            application: 'chatic',
            force: true,
        });
    });

    it('delegate에 installId가 없으면 useDynamicDeviceId의 firebase id로 등록한다', async () => {
        renderHook(() => useDeviceTokenRegistration(makeDelegate({ installId: undefined })));
        await flush();

        expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ installId: 'fid-dyn' }));
    });

    it('delegate의 application이 있으면 기본값 대신 그것을 쓴다', async () => {
        renderHook(() => useDeviceTokenRegistration(makeDelegate({ application: 'custom-app' })));
        await flush();

        expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ application: 'custom-app' }));
    });

    it('스로틀 안의 focus 재등록은 무시하고, 스로틀이 지나면 재등록한다', async () => {
        renderHook(() => useDeviceTokenRegistration(makeDelegate()));
        await flush();
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);

        // Within the throttle window: focus must be a no-op.
        nowMs += 30_000;
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await flush();
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);

        // Past the throttle window: focus re-registers with force.
        nowMs += 31_000;
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await flush();
        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });

    it('visibilitychange(visible)로도 재등록이 트리거된다', async () => {
        renderHook(() => useDeviceTokenRegistration(makeDelegate()));
        await flush();

        nowMs += 61_000;
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await flush();

        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });

    it('매 등록마다 토큰을 새로 fetch하므로 로테이션된 토큰이 반영된다', async () => {
        renderHook(() => useDeviceTokenRegistration(makeDelegate()));
        await flush();

        mockFetchDeviceToken.mockResolvedValue('tok-2');
        nowMs += 61_000;
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await flush();

        expect(mockMutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ deviceToken: 'tok-2' }));
    });

    it('토큰이 비어 있으면 등록하지 않고 다음 트리거에서 즉시 재시도한다', async () => {
        mockFetchDeviceToken.mockResolvedValue(null);

        renderHook(() => useDeviceTokenRegistration(makeDelegate()));
        await flush();
        expect(mockMutateAsync).not.toHaveBeenCalled();

        // Failure resets the throttle: the very next trigger (still inside the
        // 60s window) fetches again — covers "permission granted later".
        mockFetchDeviceToken.mockResolvedValue('tok-late');
        nowMs += 1_000;
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await flush();

        expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ deviceToken: 'tok-late' }));
    });

    it('등록 API 실패 시 스로틀을 리셋해 다음 트리거에서 즉시 재시도한다', async () => {
        mockMutateAsync.mockRejectedValueOnce(new Error('network'));

        renderHook(() => useDeviceTokenRegistration(makeDelegate()));
        await flush();
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);

        nowMs += 1_000;
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await flush();

        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });

    it('재로그인(인증 재전환) 시 스로틀과 무관하게 즉시 재등록한다', async () => {
        const { rerender } = renderHook(
            ({ auth }: { auth: boolean }) => {
                setAuthenticated(auth);
                return useDeviceTokenRegistration(makeDelegate());
            },
            { initialProps: { auth: true } }
        );
        await flush();
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);

        // Logout → login as another account within the throttle window: the new
        // session must still register (the old dedup path never did).
        nowMs += 1_000;
        rerender({ auth: false });
        rerender({ auth: true });
        await flush();

        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });

    it('등록이 진행 중이면 겹치는 트리거를 무시한다', async () => {
        let resolveFetch: (token: string) => void = () => undefined;
        mockFetchDeviceToken.mockImplementation(() => new Promise<string>(resolve => (resolveFetch = resolve)));

        renderHook(() => useDeviceTokenRegistration(makeDelegate()));

        // In-flight fetch: a concurrent focus trigger must not start a second one.
        nowMs += 61_000;
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);

        act(() => resolveFetch('tok-1'));
        await flush();
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });
});
