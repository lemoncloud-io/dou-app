import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useDevicePushMute } from './useDevicePushMute';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));

const toastMock = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let mutedState = false;
const setPushMutedMock = jest.fn((value: boolean) => {
    mutedState = value;
});
jest.mock('../../../stores/usePreferenceStore', () => ({
    usePreferenceStore: (selector: (state: { pushMuted: boolean; setPushMuted: (v: boolean) => void }) => unknown) =>
        selector({ pushMuted: mutedState, setPushMuted: setPushMutedMock }),
}));

const updateRemotePushMuteMock = jest.fn();
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
    jest.clearAllMocks();
    mutedState = false;
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
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
    });

    it('네이티브 셸이 아니면 isSupported=false, 셸이면 true (push 디바이스 존재 여부와 동일 신호)', () => {
        const { result, unmount } = renderHook(() => useDevicePushMute(), { wrapper });
        expect(result.current.isSupported).toBe(false); // jsdom: no shell global
        unmount();

        window.CHATIC_APP_PLATFORM = 'ios';
        try {
            const { result: shellResult } = renderHook(() => useDevicePushMute(), { wrapper });
            expect(shellResult.current.isSupported).toBe(true);
        } finally {
            delete window.CHATIC_APP_PLATFORM;
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
    });
});
