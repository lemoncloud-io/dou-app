import { act, renderHook, waitFor } from '@testing-library/react';

import { useRestorePurchases } from './useRestorePurchases';

/**
 * Restore is the recovery path for a purchase the store took but this account never received, so the
 * cases that matter are the unhappy ones: nothing to restore, a thrown store error, and a second
 * press while the first is still in flight.
 */

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
    isNative: () => isNativeValue,
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('@chatic/app-runtime', () => ({ useRuntimeProfile: () => ({ isGuest: isGuestValue }) }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
jest.mock('./useSubscriptionIap', () => ({
    useSubscriptionIap: () => ({ restorePurchases: restorePurchasesMock }),
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
        // The store simply holds nothing for this account. A destructive "failed" toast here would
        // send the user hunting for a problem that does not exist.
        restorePurchasesMock.mockResolvedValue(0);

        const { result } = renderHook(() => useRestorePurchases());
        await act(() => result.current.restore());

        expect(toastMock).toHaveBeenCalledWith({ title: `${K}.restoreEmpty` });
    });

    it('surfaces a thrown store error as a destructive toast rather than rejecting', async () => {
        restorePurchasesMock.mockRejectedValue(new Error('store unreachable'));

        const { result } = renderHook(() => useRestorePurchases());
        // Must not throw: callers wire this straight to an onClick.
        await act(() => result.current.restore());

        expect(toastMock).toHaveBeenCalledWith({ title: `${K}.restoreFailed`, variant: 'destructive' });
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
        // Guarded in the hook so every caller does not have to disable its own control correctly.
        // A concurrent run would re-validate the same receipts and toast twice.
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
