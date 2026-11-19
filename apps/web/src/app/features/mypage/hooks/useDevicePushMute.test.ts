import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/runtime';
import { resetHostProfileForTests } from '@chatic/bridges';

import { useDevicePushMute } from './useDevicePushMute';

// The push port's device token, swapped per test; `null` is a host that registers no push device.
let mockDeviceToken: { fetch: () => Promise<string | null> } | null = null;
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        get push() {
            return { deviceToken: mockDeviceToken };
        },
        settings: { set: (_key: string, value: boolean) => setPushMutedMock(value), useConfigValue: () => mutedState },
    })
);

const toastMock = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let mutedState = false;
const setPushMutedMock = jest.fn((value: boolean) => {
    mutedState = value;
});

const mockHaptic = jest.fn();
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));

const updateRemotePushMuteMock = jest.fn();
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
    jest.clearAllMocks();
    mutedState = false;
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        device: { updateRemotePushMute: updateRemotePushMuteMock },
    });
});

describe('useDevicePushMute', () => {
    it('토글 OFF는 muted:true를 보내고, 성공 시 서버 echo로 재조정한다', async () => {
        // Server echoes a value distinct from the optimistic flip to prove onSuccess reconciliation
        // wins over the optimistic set.
        updateRemotePushMuteMock.mockResolvedValue(false);

        const { result } = renderHook(() => useDevicePushMute(), { wrapper });
        expect(result.current.pushEnabled).toBe(true); // default ON

        act(() => result.current.setPushEnabled(false));

        // Optimistic flip is synchronous.
        expect(setPushMutedMock).toHaveBeenNthCalledWith(1, true);
        // mutate dispatches the write on a microtask; once it resolves the server's authoritative
        // echo reconciles the store.
        await waitFor(() => expect(setPushMutedMock).toHaveBeenLastCalledWith(false));
        // The relay destination is pinned inside the data layer (DeviceSocketDataSource), so the
        // hook passes only the value.
        expect(updateRemotePushMuteMock).toHaveBeenCalledWith(true);
        expect(mockHaptic).not.toHaveBeenCalled();
    });

    it('is supported only where push registration happens: a device token and an injected platform', () => {
        const { result, unmount } = renderHook(() => useDevicePushMute(), { wrapper });
        expect(result.current.isSupported).toBe(false); // jsdom: no shell global, no token
        unmount();

        // A shell that injects its platform before the page boots, when the host profile is built.
        window.CHATIC_APP_PLATFORM = 'ios';
        resetHostProfileForTests();
        try {
            const { result: noToken, unmount: unmountNoToken } = renderHook(() => useDevicePushMute(), { wrapper });
            expect(noToken.current.isSupported).toBe(false); // platform alone registers nothing
            unmountNoToken();

            mockDeviceToken = { fetch: async () => 'token' };
            const { result: shellResult } = renderHook(() => useDevicePushMute(), { wrapper });
            expect(shellResult.current.isSupported).toBe(true);
        } finally {
            mockDeviceToken = null;
            delete window.CHATIC_APP_PLATFORM;
            resetHostProfileForTests();
        }
    });

    it('요청 실패 시 이전 값으로 롤백하고 에러 토스트를 띄운다', async () => {
        updateRemotePushMuteMock.mockRejectedValue(new Error('boom'));

        const { result } = renderHook(() => useDevicePushMute(), { wrapper });
        act(() => result.current.setPushEnabled(false));

        await waitFor(() => expect(toastMock).toHaveBeenCalled());
        // optimistic true, then rolled back to the prior false.
        expect(setPushMutedMock).toHaveBeenNthCalledWith(1, true);
        expect(setPushMutedMock).toHaveBeenNthCalledWith(2, false);
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
        expect(mockHaptic.mock.calls).toEqual([['error']]);
    });
});
