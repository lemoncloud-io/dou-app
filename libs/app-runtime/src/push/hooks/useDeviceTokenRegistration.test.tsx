import { act, renderHook } from '@testing-library/react';

import { useRegisterDeviceTokenMutation } from '../../data/hooks';
import { getRelaySessionUser, useDynamicDeviceId, useSessionAuth } from '../../session';

import { useDeviceTokenRegistration } from './useDeviceTokenRegistration';
import type { DeviceTokenDelegate } from './useDeviceTokenRegistration';

jest.mock('../../session', () => ({
    useSessionAuth: jest.fn(),
    useDynamicDeviceId: jest.fn(),
    getRelaySessionUser: jest.fn(),
}));
jest.mock('../../data/hooks', () => ({
    useRegisterDeviceTokenMutation: jest.fn(),
}));

const mockUseSessionAuth = useSessionAuth as jest.Mock;
const mockUseDynamicDeviceId = useDynamicDeviceId as jest.Mock;
const mockGetRelaySessionUser = getRelaySessionUser as jest.Mock;
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
    // The registration record persists in storage on purpose — clear it so each case starts as a
    // fresh install rather than inheriting the previous one's "already registered".
    sessionStorage.clear();
    nowMs = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    setAuthenticated(true);
    mockUseDynamicDeviceId.mockReturnValue({ deviceId: 'device-1', firebaseInstallationId: 'fid-dyn', isReady: true });
    mockGetRelaySessionUser.mockReturnValue({ id: 'relay-uid' });
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
            stage: undefined,
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

    it('delegate의 stage를 body에 실어 보낸다 — 없으면 브로커가 자기 기본값(dev)으로 등록한다', async () => {
        renderHook(() => useDeviceTokenRegistration(makeDelegate({ stage: 'prod' })));
        await flush();

        expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ stage: 'prod' }));
    });

    describe('설치당 1회 (ADR-0077)', () => {
        it('등록에 성공하면 기록이 남아 다음 실행에서는 등록하지 않는다', async () => {
            const first = renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
            first.unmount();

            // Same install, next launch: the token is still fetched (that is how rotation is caught)
            // but the record matches, so no call goes out.
            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();

            expect(mockFetchDeviceToken).toHaveBeenCalledTimes(2);
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
        });

        it('기록이 있으면 포그라운드 복귀에서 토큰 fetch조차 하지 않는다', async () => {
            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);

            nowMs += 61_000;
            act(() => {
                window.dispatchEvent(new Event('focus'));
            });
            await flush();
            nowMs += 61_000;
            act(() => {
                document.dispatchEvent(new Event('visibilitychange'));
            });
            await flush();

            expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
        });

        it('기록이 없으면 포그라운드 복귀로 등록한다 — 알림 권한을 나중에 허용한 경우', async () => {
            mockFetchDeviceToken.mockResolvedValue(null);
            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            expect(mockMutateAsync).not.toHaveBeenCalled();

            mockFetchDeviceToken.mockResolvedValue('tok-late');
            act(() => {
                window.dispatchEvent(new Event('focus'));
            });
            await flush();

            expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ deviceToken: 'tok-late' }));
        });

        it('토큰이 로테이션되면 다음 실행에서 재등록하고 기록을 갱신한다', async () => {
            const first = renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            first.unmount();

            mockFetchDeviceToken.mockResolvedValue('tok-2');
            const second = renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            expect(mockMutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ deviceToken: 'tok-2' }));
            second.unmount();

            // The refreshed record now covers tok-2.
            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            expect(mockMutateAsync).toHaveBeenCalledTimes(2);
        });

        it('계정이 바뀌면 재등록한다', async () => {
            const first = renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            first.unmount();

            mockGetRelaySessionUser.mockReturnValue({ id: 'other-uid' });
            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();

            expect(mockMutateAsync).toHaveBeenCalledTimes(2);
        });

        it('디바이스 id가 바뀌면 재등록한다', async () => {
            const first = renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            first.unmount();

            mockUseDynamicDeviceId.mockReturnValue({ deviceId: 'device-2', firebaseInstallationId: 'fid-dyn' });
            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();

            expect(mockMutateAsync).toHaveBeenCalledTimes(2);
        });

        it('relay uid를 uid 필드로 실어보내는 토큰에서도 계정을 식별한다', async () => {
            mockGetRelaySessionUser.mockReturnValue({ uid: 'uid-shaped' });

            const first = renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            first.unmount();

            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();

            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
        });

        it('등록이 실패하면 기록을 남기지 않아 다음 실행에서 다시 시도한다', async () => {
            mockMutateAsync.mockRejectedValueOnce(new Error('network'));

            const first = renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
            first.unmount();

            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();

            expect(mockMutateAsync).toHaveBeenCalledTimes(2);
        });

        it('네이티브 미러가 있으면 등록 성공 시 그쪽에도 기록한다', async () => {
            const nativeRecordMirror = {
                read: jest.fn(() => Promise.resolve(null)),
                write: jest.fn(() => Promise.resolve()),
            };

            renderHook(() => useDeviceTokenRegistration(makeDelegate({ nativeRecordMirror })));
            await flush();

            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
            expect(nativeRecordMirror.write).toHaveBeenCalledWith(expect.stringContaining('tok-1'));
        });

        it('웹 저장소가 비었어도 네이티브 기록이 있으면 등록하지 않는다 — webview 캐시 삭제', async () => {
            const nativeRecordMirror = {
                read: jest.fn(() => Promise.resolve(null)),
                write: jest.fn(() => Promise.resolve()),
            };

            const first = renderHook(() => useDeviceTokenRegistration(makeDelegate({ nativeRecordMirror })));
            await flush();
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
            const persisted = nativeRecordMirror.write.mock.calls[0][0] as string;
            first.unmount();

            // The webview's own storage is wiped; only the native tier survives.
            sessionStorage.clear();
            nativeRecordMirror.read.mockResolvedValue(persisted);

            renderHook(() => useDeviceTokenRegistration(makeDelegate({ nativeRecordMirror })));
            await flush();
            await flush();

            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
        });

        it('네이티브 미러가 거부해도 등록은 성공으로 남는다 — 구버전 앱', async () => {
            const nativeRecordMirror = {
                read: jest.fn(() => Promise.resolve(null)),
                write: jest.fn(() => Promise.reject(new Error('PREF_KEY_NOT_WRITABLE'))),
            };

            const first = renderHook(() => useDeviceTokenRegistration(makeDelegate({ nativeRecordMirror })));
            await flush();
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
            first.unmount();

            // Web storage still holds the record, so the next launch stays quiet.
            renderHook(() => useDeviceTokenRegistration(makeDelegate({ nativeRecordMirror })));
            await flush();

            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
        });

        it('uid를 얻지 못하면 기록 없이 등록하되 60초 floor로 폭주를 막는다', async () => {
            mockGetRelaySessionUser.mockReturnValue(null);

            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);

            // No record can be keyed, so the pre-ADR-0077 behaviour stands: focus registers again,
            // but only once the burst floor has elapsed.
            nowMs += 30_000;
            act(() => {
                window.dispatchEvent(new Event('focus'));
            });
            await flush();
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);

            nowMs += 31_000;
            act(() => {
                window.dispatchEvent(new Event('focus'));
            });
            await flush();
            expect(mockMutateAsync).toHaveBeenCalledTimes(2);
        });
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

    it('다른 계정으로 재로그인하면 스로틀과 무관하게 즉시 재등록한다', async () => {
        const { rerender } = renderHook(
            ({ auth }: { auth: boolean }) => {
                setAuthenticated(auth);
                return useDeviceTokenRegistration(makeDelegate());
            },
            { initialProps: { auth: true } }
        );
        await flush();
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);

        nowMs += 1_000;
        mockGetRelaySessionUser.mockReturnValue({ id: 'other-uid' });
        rerender({ auth: false });
        rerender({ auth: true });
        await flush();

        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });

    it('같은 계정으로 재로그인하면 재등록하지 않는다', async () => {
        const { rerender } = renderHook(
            ({ auth }: { auth: boolean }) => {
                setAuthenticated(auth);
                return useDeviceTokenRegistration(makeDelegate());
            },
            { initialProps: { auth: true } }
        );
        await flush();
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);

        nowMs += 1_000;
        rerender({ auth: false });
        rerender({ auth: true });
        await flush();

        expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    it('등록이 진행 중이면 겹치는 트리거를 무시한다', async () => {
        let resolveFetch: (token: string) => void = () => undefined;
        mockFetchDeviceToken.mockImplementation(() => new Promise<string>(resolve => (resolveFetch = resolve)));

        renderHook(() => useDeviceTokenRegistration(makeDelegate()));
        // The attempt is registered synchronously but the fetch starts a microtask later (record
        // hydration runs first), so let that tick pass before counting.
        await flush();
        expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);

        // In-flight fetch: a concurrent focus trigger must not start a second one.
        nowMs += 61_000;
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await flush();
        expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);

        act(() => resolveFetch('tok-1'));
        await flush();
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    describe('subscribeTokenChange — 셸이 알려주는 토큰 로테이션', () => {
        it('새 토큰을 알리면 기록이 있어도 즉시 재등록한다', async () => {
            let notify: () => void = () => undefined;
            const subscribeTokenChange = jest.fn((onChange: () => void) => {
                notify = onChange;
                return () => undefined;
            });

            renderHook(() => useDeviceTokenRegistration(makeDelegate({ subscribeTokenChange })));
            await flush();
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);

            // Inside the burst floor and with a record present — neither may block a rotation.
            mockFetchDeviceToken.mockResolvedValue('tok-rotated');
            nowMs += 1_000;
            act(() => notify());
            await flush();

            expect(mockMutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ deviceToken: 'tok-rotated' }));
        });

        it('토큰이 실제로 그대로면 알림이 와도 등록하지 않는다', async () => {
            let notify: () => void = () => undefined;
            const subscribeTokenChange = jest.fn((onChange: () => void) => {
                notify = onChange;
                return () => undefined;
            });

            renderHook(() => useDeviceTokenRegistration(makeDelegate({ subscribeTokenChange })));
            await flush();

            nowMs += 1_000;
            act(() => notify());
            await flush();

            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
        });

        it('언마운트하면 구독을 해제한다', async () => {
            const unsubscribe = jest.fn();
            const subscribeTokenChange = jest.fn(() => unsubscribe);

            const { unmount } = renderHook(() => useDeviceTokenRegistration(makeDelegate({ subscribeTokenChange })));
            await flush();
            expect(subscribeTokenChange).toHaveBeenCalledTimes(1);

            unmount();

            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });

        it('delegate가 제공하지 않으면 구독하지 않는다', async () => {
            renderHook(() => useDeviceTokenRegistration(makeDelegate()));
            await flush();

            // Nothing to assert beyond "it did not throw" — the absence of the optional hook must not
            // break the mount path for mobile, which never supplies it.
            expect(mockMutateAsync).toHaveBeenCalledTimes(1);
        });
    });
});
