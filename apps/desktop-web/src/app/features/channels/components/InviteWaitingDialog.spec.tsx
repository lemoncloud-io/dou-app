import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

const listInvites = vi.fn(async (): Promise<MyInviteView[]> => []);
const cancelInvite = vi.fn(async () => ({}));
const createInvite = vi.fn(async () => ({ id: 'inv-2', deeplink: 'https://dou.example/i/def' }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                invite: {
                    list: (...args: unknown[]) => listInvites(...args),
                    cancel: (...args: unknown[]) => cancelInvite(...args),
                    create: (...args: unknown[]) => createInvite(...args),
                },
                user: { requestInvite: vi.fn(), requestInviteBatch: vi.fn() },
            }),
        },
        session: { useSessionSelection: () => ({ selectedSiteId: 'site-1' }) },
    },
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));

const copy = vi.hoisted(() => vi.fn());
vi.mock('../../../shared/hooks/useCopyToClipboard', () => ({
    useCopyToClipboard: () => [false, copy] as const,
}));

import '../../../../i18n';

import { useSelectedChannelStore } from '../../../shared';
import { useInviteWaitingStore } from '../stores/useInviteWaitingStore';
import { InviteWaitingDialog } from './InviteWaitingDialog';

const pendingRow = (): MyInviteView =>
    ({
        id: 'inv-1',
        code: 'k1',
        state: 'pending',
        name: 'Ada',
        expiredAt: Date.now() + 3_600_000,
        channelId: 'C1',
    }) as MyInviteView;

const openWaiting = (channelId?: string) => {
    act(() =>
        useInviteWaitingStore.getState().open({ inviteId: 'inv-1', phone: '+821012345678', name: 'Ada', channelId })
    );
    render(<InviteWaitingDialog />);
};

describe('InviteWaitingDialog', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        vi.useRealTimers();
        listInvites.mockResolvedValue([]);
        useInviteWaitingStore.getState().close();
        useSelectedChannelStore.setState({ selectedChannelId: null });
    });

    it('cancels through a confirm and closes with a toast', async () => {
        listInvites.mockResolvedValue([pendingRow()]);
        openWaiting();
        await screen.findByText('Waiting for Ada');

        fireEvent.click(screen.getByRole('button', { name: 'Cancel invite' }));
        fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(cancelInvite).toHaveBeenCalledWith('invt:inv-1:k1');
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Invite canceled.' }));
        expect(useInviteWaitingStore.getState().inviteId).toBeNull();
    });

    it('closes quietly when the invite is already gone at cancel time', async () => {
        cancelInvite.mockRejectedValueOnce(new Error('409 conflict'));
        listInvites.mockResolvedValue([pendingRow()]);
        openWaiting();
        await screen.findByText('Waiting for Ada');
        // The refetch inside the failed cancel now answers canceled.
        listInvites.mockResolvedValueOnce([{ ...pendingRow(), state: 'canceled' } as MyInviteView]);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel invite' }));
        fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(useInviteWaitingStore.getState().inviteId).toBeNull();
        expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });

    it('hands an accepted invite to its channel', async () => {
        listInvites.mockResolvedValue([{ ...pendingRow(), state: 'accepted' } as MyInviteView]);
        openWaiting();

        await act(async () => {
            await Promise.resolve();
        });
        expect(useSelectedChannelStore.getState().selectedChannelId).toBe('C1');
        expect(useInviteWaitingStore.getState().inviteId).toBeNull();
    });

    it('stops polling when unmounted', async () => {
        vi.useFakeTimers();
        listInvites.mockResolvedValue([pendingRow()]);
        openWaiting();
        await act(async () => {
            await Promise.resolve();
        });
        expect(listInvites).toHaveBeenCalledTimes(1);

        cleanup();
        await act(async () => {
            vi.advanceTimersByTime(60_000);
        });
        expect(listInvites).toHaveBeenCalledTimes(1);
    });

    it('reissues by retiring first, then creating with the remembered recipient', async () => {
        listInvites.mockResolvedValue([{ ...pendingRow(), state: 'expired' } as MyInviteView]);
        openWaiting();
        await screen.findByText('This invite has expired.');

        fireEvent.click(screen.getByRole('button', { name: 'Send a new invite' }));

        await act(async () => {
            await Promise.resolve();
        });
        // Expired priors are best-effort tidying and never block the reissue.
        expect(createInvite).toHaveBeenCalledWith({ phone: '+821012345678', name: 'Ada', expiresDays: 1 });
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'New invite sent.' }));
        expect(useInviteWaitingStore.getState().inviteId).toBe('inv-2');
    });

    it('reissues a channel invite bound to the same channel', async () => {
        listInvites.mockResolvedValue([{ ...pendingRow(), state: 'expired' } as MyInviteView]);
        openWaiting('C1');
        await screen.findByText('This invite has expired.');

        fireEvent.click(screen.getByRole('button', { name: 'Send a new invite' }));

        await act(async () => {
            await Promise.resolve();
        });
        // Without the channel the new invite is unbound, and accepting it no longer enters the room.
        expect(createInvite).toHaveBeenCalledWith({
            phone: '+821012345678',
            name: 'Ada',
            channelId: 'C1',
            expiresDays: 1,
        });
        expect(useInviteWaitingStore.getState()).toMatchObject({ inviteId: 'inv-2', channelId: 'C1' });
    });

    it('drops the time left once the invite is declined', async () => {
        listInvites.mockResolvedValue([{ ...pendingRow(), state: 'rejected' } as MyInviteView]);
        openWaiting('C1');

        await screen.findByRole('button', { name: 'Send a new invite' });
        expect(screen.queryByText(/left/)).toBeNull();
    });

    it('offers no cancel before the invite row has loaded', async () => {
        listInvites.mockImplementation(() => new Promise(() => undefined));
        openWaiting();

        await screen.findByText('Checking the invite…');
        expect(screen.queryByRole('button', { name: 'Cancel invite' })).toBeNull();
    });

    it('keeps the dialog open with an error when cancel and the re-list both fail', async () => {
        cancelInvite.mockRejectedValueOnce(new Error('network down'));
        listInvites.mockResolvedValueOnce([pendingRow()]).mockRejectedValueOnce(new Error('network down'));
        openWaiting();
        await screen.findByText('Waiting for Ada');

        fireEvent.click(screen.getByRole('button', { name: 'Cancel invite' }));
        fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

        // The failed re-ask is not "gone": the dialog stays for a retry.
        await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
        expect(useInviteWaitingStore.getState().inviteId).toBe('inv-1');
    });

    it('sends cancel once on a double confirm', async () => {
        let release!: (value: unknown) => void;
        cancelInvite.mockImplementationOnce(() => new Promise(resolve => (release = resolve)));
        listInvites.mockResolvedValue([pendingRow()]);
        openWaiting();
        await screen.findByText('Waiting for Ada');

        fireEvent.click(screen.getByRole('button', { name: 'Cancel invite' }));
        const confirm = screen.getByRole('button', { name: 'Yes, cancel' });
        fireEvent.click(confirm);
        fireEvent.click(confirm);

        // The confirm handler resolves the code first; flush the chain.
        await act(async () => {
            await Promise.resolve();
        });
        expect(cancelInvite).toHaveBeenCalledTimes(1);
        await act(async () => {
            release({});
        });
    });
});
