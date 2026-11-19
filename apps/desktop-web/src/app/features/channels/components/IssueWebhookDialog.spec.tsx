import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastFailure = vi.hoisted(() => vi.fn());
vi.mock('../../../shared', async importOriginal => ({ ...(await importOriginal<object>()), toastFailure }));

import '../../../../i18n';
import { IssueWebhookDialog } from './IssueWebhookDialog';

const writeText = vi.fn();
const issued = {
    webhook: {
        id: 'w',
        channelId: 'C1',
        name: 'ci',
        desc: '',
        paused: false,
        expiresAt: 0,
        lastUsedAt: 0,
        createdAt: 1,
    },
    token: 'wh:w:secret',
    location: 'https://api.example/hello/webhook',
};

const setup = (onIssue = vi.fn().mockResolvedValue(issued)) => {
    const onOpenChange = vi.fn();
    const view = render(<IssueWebhookDialog open onOpenChange={onOpenChange} onIssue={onIssue} />);
    return { onIssue, onOpenChange, view };
};

describe('IssueWebhookDialog', () => {
    beforeEach(() => {
        toastFailure.mockReset();
        writeText.mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    });
    afterEach(() => {
        cleanup();
        writeText.mockReset();
    });

    it('sends the trimmed name and a never-expires 0, then shows the token and endpoint once', async () => {
        const { onIssue } = setup();
        fireEvent.change(screen.getByPlaceholderText('e.g. CI alerts'), { target: { value: '  ci  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        expect(await screen.findByText('wh:w:secret')).toBeDefined();
        expect(onIssue).toHaveBeenCalledWith({ name: 'ci', expiresAt: 0 });
        expect(screen.getByText('https://api.example/hello/webhook')).toBeDefined();

        await act(async () => {
            fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
        });
        expect(writeText).toHaveBeenCalledWith('wh:w:secret');
    });

    it('omits an empty name', async () => {
        const { onIssue } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await screen.findByText('wh:w:secret');
        expect(onIssue).toHaveBeenCalledWith({ expiresAt: 0 });
    });

    it('says so when the server returned no endpoint', async () => {
        setup(vi.fn().mockResolvedValue({ ...issued, location: undefined }));
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        expect(await screen.findByText('The server did not return an endpoint URL.')).toBeDefined();
    });

    it('drops the token once the dialog closes', async () => {
        const onIssue = vi.fn().mockResolvedValue(issued);
        const onOpenChange = vi.fn();
        const { rerender } = render(<IssueWebhookDialog open onOpenChange={onOpenChange} onIssue={onIssue} />);
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await screen.findByText('wh:w:secret');

        rerender(<IssueWebhookDialog open={false} onOpenChange={onOpenChange} onIssue={onIssue} />);
        rerender(<IssueWebhookDialog open onOpenChange={onOpenChange} onIssue={onIssue} />);

        expect(screen.queryByText('wh:w:secret')).toBeNull();
        expect(screen.getByRole('button', { name: 'Create' })).toBeDefined();
    });

    it('toasts a failed create and stays on the form', async () => {
        setup(vi.fn().mockRejectedValue(new Error('403')));
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await waitFor(() =>
            expect(toastFailure).toHaveBeenCalledWith('Could not create the webhook.', expect.any(Error))
        );
        expect(screen.getByRole('button', { name: 'Create' })).toBeDefined();
    });
});
