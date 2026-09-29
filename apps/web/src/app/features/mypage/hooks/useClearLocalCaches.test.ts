import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useClearLocalCaches } from './useClearLocalCaches';

jest.mock('@chatic/app-runtime', () => ({ runtime: { data: { clearLocalCaches: jest.fn() } } }));

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const clearLocalCaches = runtime.data.clearLocalCaches as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useClearLocalCaches', () => {
    it('reloads once every clear succeeded, and shows no error', async () => {
        clearLocalCaches.mockResolvedValue({ clouds: ['default'], failures: 0 });
        const reload = jest.fn();
        const { result } = renderHook(() => useClearLocalCaches(reload));

        await act(() => result.current.clearLocalCaches());

        expect(reload).toHaveBeenCalledTimes(1);
        expect(toast).not.toHaveBeenCalled();
    });

    it('stays on the page and says so when some clears failed, so the person can retry', async () => {
        clearLocalCaches.mockResolvedValue({ clouds: ['default'], failures: 2 });
        const reload = jest.fn();
        const { result } = renderHook(() => useClearLocalCaches(reload));

        await act(() => result.current.clearLocalCaches());

        expect(reload).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: 'mypage.clearCache.failed', variant: 'destructive' });
        expect(result.current.isClearing).toBe(false);
    });

    it('treats a rejected sweep the same as a failed one', async () => {
        clearLocalCaches.mockRejectedValue(new Error('no data runtime'));
        const reload = jest.fn();
        const { result } = renderHook(() => useClearLocalCaches(reload));

        await act(() => result.current.clearLocalCaches());

        expect(reload).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledTimes(1);
    });

    it('reports the clear as in flight until it settles', async () => {
        let finish: (value: { clouds: string[]; failures: number }) => void = () => undefined;
        clearLocalCaches.mockReturnValue(new Promise(resolve => (finish = resolve)));
        const { result } = renderHook(() => useClearLocalCaches(jest.fn()));

        let pending: Promise<void> = Promise.resolve();
        act(() => {
            pending = result.current.clearLocalCaches();
        });
        expect(result.current.isClearing).toBe(true);

        await act(async () => {
            finish({ clouds: [], failures: 1 });
            await pending;
        });
        expect(result.current.isClearing).toBe(false);
    });
});
