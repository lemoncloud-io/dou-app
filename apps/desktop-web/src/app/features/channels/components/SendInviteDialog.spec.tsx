import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const createInvite = vi.fn(async () => ({ id: 'inv-1', deeplink: 'https://dou.example/i/abc' }));
// `user.invite` answers with the link in `Location`, not `deeplink`.
const requestPlaceInvite = vi.fn(async () => ({ id: 'inv-p', Location: 'https://dou.example/p/xyz' }));

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
        session: {
            useSessionSelection: () => ({ selectedSiteId: 'site-1' }),
            getRelaySessionUser: () => relayUser.current,
        },
    },
}));

// The relay user the invite is issued as: a contact invite rides the relay slot.
const relayUser = vi.hoisted(() => ({ current: { userRole: 'user' } as { userRole: string } | null }));

const logError = vi.hoisted(() => vi.fn());
vi.mock('@chatic/bridges', async importOriginal => {
    const actual = await importOriginal<{ logger: object }>();
    return { ...actual, logger: { ...actual.logger, error: logError } };
});

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
        requestPlaceInvite.mockResolvedValue({ id: 'inv-p', Location: 'https://dou.example/p/xyz' });
        useSendInviteStore.getState().close();
        useInviteWaitingStore.getState().close();
        useInviteLinkStore.getState().close();
        relayUser.current = { userRole: 'user' };
    });

    const submitValid = () => {
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
        fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+821024792987' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    };

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

    it('tells a guest that inviting needs a signed-in account, not to check the number', async () => {
        relayUser.current = { userRole: 'guest' };
        createInvite.mockRejectedValueOnce(new Error('403 NOT ALLOWED - main user only @issueInvite(U1)'));
        openDialog();

        submitValid();

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('signed-in account');
        expect(alert.textContent).not.toContain('Check the number');
    });

    it('does not ask a guest to sign in for a refused place invite', async () => {
        relayUser.current = { userRole: 'guest' };
        requestPlaceInvite.mockRejectedValueOnce(new Error('403 NOT ALLOWED - not the owner'));
        openPlaceDialog();

        submitValid();

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).not.toContain('signed-in account');
        expect(alert.textContent).not.toContain('Check the number');
    });

    it('keeps the server reason for a failed invite in the log', async () => {
        createInvite.mockRejectedValueOnce(new Error('403 NOT ALLOWED - user is banned @issueInvite(U1)'));
        openDialog();

        submitValid();

        await screen.findByRole('alert');
        expect(logError).toHaveBeenCalledWith(
            'INVITE',
            expect.any(String),
            expect.objectContaining({ raw: '403 NOT ALLOWED - user is banned @issueInvite(U1)' })
        );
    });

    it('shows the server reason in the failure toast', async () => {
        createInvite.mockRejectedValueOnce(new Error('403 NOT ALLOWED - user is banned @issueInvite(U1)'));
        openDialog();

        submitValid();

        await screen.findByRole('alert');
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
                variant: 'destructive',
                description: '403 NOT ALLOWED - user is banned @issueInvite(U1)',
            })
        );
    });

    it('asks to check the number only when the server rejected the number', async () => {
        createInvite.mockRejectedValueOnce(new Error('400 INVALID - @phone is invalid'));
        openDialog();

        submitValid();

        expect((await screen.findByRole('alert')).textContent).toContain('Check the number');
    });

    it.each([
        ['no socket', '503 SOCKET NOT CONNECTED - WebSocketTransport.send()'],
        ['a timeout', '408 REQUEST TIMEOUT - invite.create'],
    ])('shows the connection line, not the number check, for %s', async (_label, message) => {
        createInvite.mockRejectedValueOnce(new Error(message));
        openDialog();

        submitValid();

        expect((await screen.findByRole('alert')).textContent).toContain("Couldn't reach the server");
    });

    it('reads the refusal from the carried status when the wording has none', async () => {
        relayUser.current = { userRole: 'guest' };
        createInvite.mockRejectedValueOnce(
            Object.assign(new Error('main user only - invite.create:error'), { errorCode: 403 })
        );
        openDialog();

        submitValid();

        expect((await screen.findByRole('alert')).textContent).toContain('signed-in account');
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
