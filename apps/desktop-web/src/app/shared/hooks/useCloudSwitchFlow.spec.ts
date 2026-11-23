import { act, render, renderHook, screen } from '@testing-library/react';
import i18next from 'i18next';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
    selectedCloudId: 'A',
    switchCloud: vi.fn(),
    logoutCloudSession: vi.fn(),
    toast: vi.fn(),
}));

const data = vi.hoisted(() => ({
    recover: vi.fn(() => Promise.resolve()),
    cloudRepository: { id: 'cloud-repo' },
}));

const catalog = vi.hoisted(() => ({
    ownedClouds: [] as Array<{ id: string }>,
}));

vi.mock('@chatic/runtime', async () =>
    (await import('@chatic/runtime/testing')).fakeRuntimeModule({
        session: {
            useSwitchCloudSession: () => ({ switchCloud: session.switchCloud, isPending: false }),
            useLogoutCloudSession: () => ({ logoutCloudSession: session.logoutCloudSession }),
            useSessionSelection: () => ({ selectedCloudId: session.selectedCloudId }),
        },
        data: {
            recoverInvitedCloudIfMissing: (...args: unknown[]) => data.recover(...(args as [])),
            useRuntimeRepositories: () => ({ cloud: data.cloudRepository }),
        },
    })
);
vi.mock('./useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: catalog.ownedClouds }),
    useOwnedCloudIds: () => new Set(catalog.ownedClouds.map((c: { id: string }) => c.id)),
}));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn() } }));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: session.toast }));

import '../../../i18n';

import { switchCauseKey, useCloudSwitchFlow } from './useCloudSwitchFlow';

beforeEach(() => {
    vi.clearAllMocks();
    session.selectedCloudId = 'A';
    catalog.ownedClouds = [];
});

describe('switchCauseKey', () => {
    it.each([
        [new Error('Failed to fetch'), 'cloud.switchCause.network'],
        [new Error('403 NOT ALLOWED - cloud access'), 'cloud.switchCause.denied'],
        [new Error('404 NOT FOUND - cloud'), 'cloud.switchCause.notFound'],
        [new Error('400 INVALID - token'), 'cloud.switchCause.other'],
    ])('names the cause of %s', (error, key) => {
        expect(switchCauseKey(error)).toBe(key);
    });
});

describe('useCloudSwitchFlow invited-cloud recovery', () => {
    const switchTo = async (cloudId: string) => {
        const { result } = renderHook(() => useCloudSwitchFlow());
        await act(() => result.current.switchCloud(cloudId));
    };

    it('recovers a missing invited cloud before switching to it', async () => {
        await switchTo('B');

        expect(data.recover).toHaveBeenCalledWith('B');
        expect(session.switchCloud).toHaveBeenCalledWith('B');
        expect(data.recover.mock.invocationCallOrder[0]).toBeLessThan(session.switchCloud.mock.invocationCallOrder[0]);
    });

    it('leaves an owned cloud alone — the relay catalog is its record', async () => {
        catalog.ownedClouds = [{ id: 'B' }];
        await switchTo('B');

        expect(data.recover).not.toHaveBeenCalled();
        expect(session.switchCloud).toHaveBeenCalledWith('B');
    });

    it('switches best-effort when the recovery rejects', async () => {
        data.recover.mockRejectedValueOnce(new Error('gone'));
        await switchTo('B');

        expect(session.switchCloud).toHaveBeenCalledWith('B');
    });

    it('reads the relay push sentinel as the relay and leaves the cloud for it', async () => {
        await switchTo('#');

        expect(session.logoutCloudSession).toHaveBeenCalledTimes(1);
        expect(data.recover).not.toHaveBeenCalled();
        expect(session.switchCloud).not.toHaveBeenCalled();
    });

    it('does nothing for the sentinel while already on the relay', async () => {
        session.selectedCloudId = 'default';
        await switchTo('#');

        expect(session.logoutCloudSession).not.toHaveBeenCalled();
        expect(session.switchCloud).not.toHaveBeenCalled();
    });

    it('ignores a second switch while the recovery is still in flight', async () => {
        let finishRecovery: () => void = () => undefined;
        data.recover.mockImplementationOnce(() => new Promise<void>(resolve => (finishRecovery = resolve)));
        const { result } = renderHook(() => useCloudSwitchFlow());

        let first: Promise<void> = Promise.resolve();
        act(() => {
            first = result.current.switchCloud('B');
        });
        await act(() => result.current.switchCloud('C'));
        await act(async () => {
            finishRecovery();
            await first;
        });

        expect(data.recover).toHaveBeenCalledTimes(1);
        expect(session.switchCloud).toHaveBeenCalledTimes(1);
        expect(session.switchCloud).toHaveBeenCalledWith('B');
    });
});

describe('useCloudSwitchFlow retry', () => {
    it('does nothing once the reader is already on that cloud', async () => {
        session.switchCloud.mockRejectedValueOnce(new Error('Failed to fetch'));
        const { result, rerender } = renderHook(() => useCloudSwitchFlow());
        await act(() => result.current.switchCloud('B'));
        const action = session.toast.mock.calls[0][0].action as { props: { onClick: () => void } };
        session.selectedCloudId = 'B';
        rerender();
        await act(async () => action.props.onClick());
        expect(session.switchCloud).toHaveBeenCalledTimes(1);
    });
});

describe('useCloudSwitchFlow failure toast', () => {
    const failWith = async (error: Error) => {
        session.selectedCloudId = 'A';
        session.switchCloud.mockRejectedValueOnce(error);
        const { result } = renderHook(() => useCloudSwitchFlow());
        await act(() => result.current.switchCloud('B'));
        return session.toast.mock.calls.at(-1)?.[0] as { description: ReactNode; action?: unknown };
    };

    it('offers no Try again for a refused cloud and points at the mobile app', async () => {
        const { description, action } = await failWith(new Error('403 NOT ALLOWED - cloud access'));
        expect(action).toBeUndefined();
        render(description as ReactElement);
        expect(screen.getByText(i18next.t('mobileApp.planAndCloud'), { exact: false })).toBeTruthy();
    });

    it('offers no Try again for a cloud that no longer exists', async () => {
        const { action } = await failWith(new Error('404 NOT FOUND - cloud'));
        expect(action).toBeUndefined();
    });

    it('keeps Try again for a dropped connection', async () => {
        const { description, action } = await failWith(new Error('Failed to fetch'));
        expect(action).toBeDefined();
        render(description as ReactElement);
        expect(screen.getByText(i18next.t('cloud.switchCause.network'), { exact: false })).toBeTruthy();
    });

    it("shows the server's own words under the cause", async () => {
        const { description } = await failWith(new Error('403 NOT ALLOWED - cloud access'));
        render(description as ReactElement);
        expect(screen.getByText('403 NOT ALLOWED - cloud access')).toBeTruthy();
    });
});
