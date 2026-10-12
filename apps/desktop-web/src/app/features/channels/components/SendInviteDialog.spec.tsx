import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const createInvite = vi.fn(async () => ({ id: 'inv-1', deeplink: 'https://dou.example/i/abc' }));
const requestPlaceInvite = vi.fn(async () => ({ id: 'inv-p', deeplink: 'https://dou.example/p/xyz' }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                invite: { create: (...args: unknown[]) => createInvite(...args), cancel: vi.fn(), list: vi.fn() },
                user: {
                    requestInvite: (...args: unknown[]) => requestPlaceInvite(...args),
                    requestInviteBatch: vi.fn(),
                },
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

// The clipboard is not observable in jsdom; the spy is how a test sees the copy.
const copy = vi.hoisted(() => vi.fn());
vi.mock('../../../shared/hooks/useCopyToClipboard', () => ({
    useCopyToClipboard: () => [false, copy] as const,
}));

import '../../../../i18n';

import { useSendInviteStore } from '../stores/useSendInviteStore';
import { useInviteWaitingStore } from '../stores/useInviteWaitingStore';
import { useInviteLinkStore } from '../stores/useInviteLinkStore';
import { SendInviteDialog } from './SendInviteDialog';

const openDialog = (channelId = 'C1', channelName = 'general') => {
    act(() => useSendInviteStore.getState().open(channelId, channelName));
    render(<SendInviteDialog />);
};

const openPlaceDialog = (placeId = 'P1', placeName = 'Studio') => {
    act(() => useSendInviteStore.getState().openPlace(placeId, placeName));
    render(<SendInviteDialog />);
};

describe('SendInviteDialog', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        createInvite.mockResolvedValue({ id: 'inv-1', deeplink: 'https://dou.example/i/abc' });
        requestPlaceInvite.mockResolvedValue({ id: 'inv-p', deeplink: 'https://dou.example/p/xyz' });
        useSendInviteStore.getState().close();
        useInviteWaitingStore.getState().close();
        useInviteLinkStore.getState().close();
    });

    it('blocks an invalid phone with an inline error and sends nothing', () => {
        openDialog();

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
        fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: 'not-a-number' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

        expect(screen.getByRole('alert').textContent).toContain('Enter a valid phone number');
        expect(createInvite).not.toHaveBeenCalled();
    });

    it('announces a failed create and keeps the dialog open', async () => {
        createInvite.mockRejectedValueOnce(new Error('offline'));
        openDialog();

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
        fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+821012345678' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

        await screen.findByRole('alert');
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
        // Still open: the failure is shown in place, not stranded on a closed dialog.
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('copies the invite link and closes on success', async () => {
        openDialog();

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
        fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '010-1234-5678' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(createInvite).toHaveBeenCalledWith({
            phone: '+821012345678',
            name: 'Ada',
            channelId: 'C1',
            expiresDays: 1,
        });
        expect(copy).toHaveBeenCalledWith('https://dou.example/i/abc');
        expect(useSendInviteStore.getState().target).toBeNull();
        // The send lands on the waiting dialog with the recipient's memory.
        expect(useInviteWaitingStore.getState().inviteId).toBe('inv-1');
        act(() => useInviteWaitingStore.getState().close());
    });

    // A place invite names no room — and lands on the link dialog, not the waiting one.
    it('sends a place-bound invite and opens its link', async () => {
        openPlaceDialog();

        expect(screen.getByRole('dialog')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
        fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+821012345678' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(requestPlaceInvite).toHaveBeenCalledWith({ phone: '+821012345678', name: 'Ada' });
        expect(createInvite).not.toHaveBeenCalled();
        expect(copy).toHaveBeenCalledWith('https://dou.example/p/xyz');
        expect(useInviteLinkStore.getState().link).toBe('https://dou.example/p/xyz');
        expect(useInviteWaitingStore.getState().inviteId).toBeNull();
        act(() => useInviteLinkStore.getState().close());
    });

    it('says when the server answers without a link', async () => {
        createInvite.mockResolvedValueOnce({ id: 'inv-1' });
        openDialog();

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
        fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+821012345678' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

        await screen.findByRole('alert');
        expect(copy).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('sends once on a double submit', async () => {
        let release!: (value: unknown) => void;
        createInvite.mockImplementationOnce(() => new Promise(resolve => (release = resolve)));
        openDialog();

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
        fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+821012345678' } });
        const submit = screen.getByRole('button', { name: 'Send invite' });
        fireEvent.click(submit);
        fireEvent.click(submit);

        expect(createInvite).toHaveBeenCalledTimes(1);
        await act(async () => {
            release({ id: 'inv-1', deeplink: 'https://dou.example/i/abc' });
        });
    });
});
