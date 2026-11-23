import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

const env = vi.hoisted(() => ({
    check: vi.fn(),
    onEnded: (_cloudId: string) => undefined as void,
    logout: vi.fn(() => Promise.resolve()),
    resetAccount: vi.fn(() => Promise.resolve()),
    toast: vi.fn(),
}));

vi.mock('@chatic/runtime', async () =>
    (await import('@chatic/runtime/testing')).fakeRuntimeModule({
        session: {
            useSessionLogout: () => env.logout,
            usePairedCloudCheck: (onEnded: (cloudId: string) => void) => {
                env.onEnded = onEnded;
                return { check: env.check };
            },
        },
    })
);
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (...args: unknown[]) => env.toast(...args) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../shared', () => ({ useAccountResetOnLogout: () => ({ resetAccount: env.resetAccount }) }));

import { usePairedCloudSignOut } from './usePairedCloudSignOut';

const emitVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('usePairedCloudSignOut', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('checks the paired clouds again on returning to the window', () => {
        renderHook(() => usePairedCloudSignOut());

        emitVisibility('visible');

        expect(env.check).toHaveBeenCalledTimes(1);
    });

    it('does not check when the window goes to the background', () => {
        renderHook(() => usePairedCloudSignOut());

        emitVisibility('hidden');

        expect(env.check).not.toHaveBeenCalled();
    });

    it('stops listening once unmounted', () => {
        const { unmount } = renderHook(() => usePairedCloudSignOut());
        unmount();

        emitVisibility('visible');

        expect(env.check).not.toHaveBeenCalled();
    });

    it('says an approval ended and signs out once — account reset first — however many clouds ended', async () => {
        renderHook(() => usePairedCloudSignOut());

        await act(async () => {
            env.onEnded('1000002');
            env.onEnded('1000004');
        });

        expect(env.toast).toHaveBeenCalledTimes(2);
        expect(env.toast).toHaveBeenCalledWith({ title: 'pairing.cloud.ended' });
        expect(env.resetAccount).toHaveBeenCalledTimes(1);
        expect(env.logout).toHaveBeenCalledTimes(1);
        expect(env.resetAccount.mock.invocationCallOrder[0]).toBeLessThan(env.logout.mock.invocationCallOrder[0]);
    });
});
