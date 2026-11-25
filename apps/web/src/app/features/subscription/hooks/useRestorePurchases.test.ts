import { act, renderHook, waitFor } from '@testing-library/react';

import { WebSubscriptionActiveError } from '../lib/webSubscriptionActive';
import { useRestorePurchases } from './useRestorePurchases';

const restorePurchasesMock = jest.fn();
const toastMock = jest.fn();
let isNativeValue = true;
let isGuestValue = false;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, arg?: unknown) =>
            arg && typeof arg === 'object' && 'count' in (arg as Record<string, unknown>)
                ? `${key}:${(arg as { count: number }).count}`
                : key,
    }),
}));
jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        session: {
            useRuntimeProfile: () => ({ isGuest: isGuestValue }),
        },
        get checkout() {
            return isNativeValue ? { kind: 'store', store: 'google' } : { kind: 'web' };
        },
    })
);
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
jest.mock('./useSubscriptionIap', () => ({
    useSubscriptionIap: () => ({ restorePurchases: restorePurchasesMock }),
}));

const showWebActiveMock = jest.fn();
jest.mock('./useWebSubscriptionNotice', () => ({
    useWebSubscriptionNotice: () => ({ show: showWebActiveMock, notice: null }),
}));

const K = 'mypage.subscription';

beforeEach(() => {
    jest.clearAllMocks();
    isNativeValue = true;
    isGuestValue = false;
});

describe('useRestorePurchases — outcome reporting', () => {
    it('reports how many purchases came back', async () => {
        restorePurchasesMock.mockResolvedValue(2);

        const { result } = renderHook(() => useRestorePurchases());
        await act(() => result.current.restore());

        expect(toastMock).toHaveBeenCalledWith({ title: `${K}.restoreSuccess:2` });
    });

    it('treats zero restored as a normal outcome, not a failure', async () => {
        restorePurchasesMock.mockResolvedValue(0);

        const { result } = renderHook(() => useRestorePurchases());
        await act(() => result.current.restore());

        expect(toastMock).toHaveBeenCalledWith({ title: `${K}.restoreEmpty` });
    });

    it('surfaces a thrown store error as a destructive toast rather than rejecting', async () => {
        restorePurchasesMock.mockRejectedValue(new Error('store unreachable'));

        const { result } = renderHook(() => useRestorePurchases());
        await act(() => result.current.restore());

        expect(toastMock).toHaveBeenCalledWith({ title: `${K}.restoreFailed`, variant: 'destructive' });
    });

    it('explains a website subscription instead of reporting a failed restore', async () => {
        restorePurchasesMock.mockRejectedValue(new WebSubscriptionActiveError());

        const { result } = renderHook(() => useRestorePurchases());
        await act(() => result.current.restore());

        expect(showWebActiveMock).toHaveBeenCalledTimes(1);
        expect(toastMock).not.toHaveBeenCalled();
    });

    it('clears the in-flight flag even when the store throws', async () => {
        restorePurchasesMock.mockRejectedValue(new Error('store unreachable'));

        const { result } = renderHook(() => useRestorePurchases());
        await act(() => result.current.restore());

        await waitFor(() => expect(result.current.isRestoring).toBe(false));
    });
});

describe('useRestorePurchases — re-entry', () => {
    it('ignores a second press while the first restore is still running', async () => {
        let release: (value: number) => void = () => undefined;
        restorePurchasesMock.mockReturnValue(
            new Promise<number>(resolve => {
                release = resolve;
            })
        );

        const { result } = renderHook(() => useRestorePurchases());

        act(() => void result.current.restore());
        await waitFor(() => expect(result.current.isRestoring).toBe(true));
        await act(async () => {
            await result.current.restore();
        });

        expect(restorePurchasesMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            release(1);
        });
    });
});

describe('useRestorePurchases — when the control should exist', () => {
    it('offers restore inside the native shell for a signed-in user', () => {
        const { result } = renderHook(() => useRestorePurchases());

        expect(result.current.canRestore).toBe(true);
    });

    it('hides restore off-native, where there is no store to ask', () => {
        isNativeValue = false;

        const { result } = renderHook(() => useRestorePurchases());

        expect(result.current.canRestore).toBe(false);
    });

    it('hides restore for a guest, who has no account to attach a receipt to', () => {
        isGuestValue = true;

        const { result } = renderHook(() => useRestorePurchases());

        expect(result.current.canRestore).toBe(false);
    });
});
