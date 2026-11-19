import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainWebhook } from '@chatic/runtime';

const hook = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../hooks/useChannelWebhooks', () => ({ useChannelWebhooks: () => hook.current }));
const toastFailure = vi.hoisted(() => vi.fn());
vi.mock('../../../shared', async importOriginal => ({ ...(await importOriginal<object>()), toastFailure }));

import '../../../../i18n';
import { ChannelWebhooksSection } from './ChannelWebhooksSection';

const row = (over: Partial<DomainWebhook> = {}): DomainWebhook => ({
    id: 'w1',
    channelId: 'C1',
    name: 'ci',
    desc: '',
    paused: false,
    expiresAt: 0,
    lastUsedAt: 0,
    createdAt: 1,
    ...over,
});

const setHook = (over: Record<string, unknown>) => {
    hook.current = {
        webhooks: [],
        status: 'ready',
        retry: vi.fn(),
        issue: vi.fn(),
        setPaused: vi.fn().mockResolvedValue(undefined),
        setExpiresAt: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
    return hook.current as Record<string, ReturnType<typeof vi.fn>>;
};

describe('ChannelWebhooksSection', () => {
    beforeEach(() => toastFailure.mockReset());
    afterEach(cleanup);

    it('shows a loading line', () => {
        setHook({ status: 'loading' });
        render(<ChannelWebhooksSection channelId="C1" />);
        expect(screen.getByText('Loading webhooks…')).toBeDefined();
    });

    it('shows an error with a retry', () => {
        const h = setHook({ status: 'error' });
        render(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(h.retry).toHaveBeenCalled();
    });

    it('shows an empty state with the issue button', () => {
        setHook({});
        render(<ChannelWebhooksSection channelId="C1" />);
        expect(screen.getByText('No webhooks yet.')).toBeDefined();
        expect(screen.getByRole('button', { name: 'New webhook' })).toBeDefined();
    });

    it('lists rows with paused and expired badges and last use', () => {
        setHook({
            webhooks: [
                row({ id: 'a', name: 'ci', paused: true, lastUsedAt: Date.UTC(2026, 10, 1) }),
                row({ id: 'b', name: 'old', expiresAt: 1 }),
                row({ id: 'c', name: '' }),
            ],
        });
        render(<ChannelWebhooksSection channelId="C1" />);
        expect(screen.getByText('Paused')).toBeDefined();
        expect(screen.getByText('Expired')).toBeDefined();
        expect(screen.getByText('Unnamed webhook')).toBeDefined();
        expect(screen.getAllByText(/Never used/)).toHaveLength(2);
        expect(screen.getByText(/Last used/)).toBeDefined();
    });

    it('pauses and resumes', async () => {
        const h = setHook({ webhooks: [row({ id: 'a', paused: false }), row({ id: 'b', paused: true })] });
        render(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
        fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
        await waitFor(() => expect(h.setPaused).toHaveBeenCalledTimes(2));
        expect(h.setPaused).toHaveBeenCalledWith('a', true);
        expect(h.setPaused).toHaveBeenCalledWith('b', false);
    });

    it('sets an expiry preset', async () => {
        const h = setHook({ webhooks: [row({ id: 'a' })] });
        render(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.change(screen.getByLabelText('Change expiry'), { target: { value: 'never' } });
        await waitFor(() => expect(h.setExpiresAt).toHaveBeenCalledWith('a', 0));
    });

    it('toasts a failed write and keeps the list', async () => {
        setHook({ webhooks: [row()], setPaused: vi.fn().mockRejectedValue(new Error('403')) });
        render(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
        await waitFor(() =>
            expect(toastFailure).toHaveBeenCalledWith('Could not update the webhook.', expect.any(Error))
        );
        expect(screen.getByText('ci')).toBeDefined();
    });

    it('deletes only after the confirm', async () => {
        const h = setHook({ webhooks: [row({ id: 'a', name: 'ci' })] });
        render(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(h.remove).not.toHaveBeenCalled();
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByText(/"ci"/)).toBeDefined();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(h.remove).toHaveBeenCalledWith('a'));
    });
});
