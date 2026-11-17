import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { DomainWebhook } from '@chatic/data';

import { ChannelWebhooksSection } from './ChannelWebhooksSection';

let hookValue: any;
const toast = jest.fn();

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('../hooks/useChannelWebhooks', () => ({ useChannelWebhooks: () => hookValue }));
jest.mock('./IssueWebhookDialog', () => ({
    IssueWebhookDialog: (p: any) => <div data-testid="issue" data-open={String(p.open)} />,
}));
jest.mock('./ConfirmDialog', () => ({
    ConfirmDialog: (p: any) => (p.open ? <button onClick={p.onConfirm}>{`confirm:${p.confirmLabel}`}</button> : null),
}));
jest.mock('@chatic/web-ui-kit', () => ({
    GroupLabel: ({ label }: any) => <p>{label}</p>,
    ListRow: ({ title, subtitle, trailing, onClick }: any) => {
        const body = (
            <>
                <span>{title}</span>
                <span>{subtitle}</span>
                <span>{trailing}</span>
            </>
        );
        return onClick ? (
            <button type="button" onClick={onClick}>
                {body}
            </button>
        ) : (
            <div>{body}</div>
        );
    },
    BottomSheet: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
}));

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

const setHook = (over: Record<string, unknown> = {}) => {
    hookValue = {
        webhooks: [],
        status: 'ready',
        retry: jest.fn(),
        issue: jest.fn(),
        setPaused: jest.fn().mockResolvedValue(undefined),
        setExpiresAt: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
        ...over,
    };
    return hookValue;
};

beforeEach(() => toast.mockReset());

describe('ChannelWebhooksSection', () => {
    it('shows loading, error with retry, and empty states', () => {
        setHook({ status: 'loading' });
        const { rerender } = render(<ChannelWebhooksSection channelId="C1" />);
        expect(screen.getByText('chat.settings.webhooks.loading')).toBeInTheDocument();

        const h = setHook({ status: 'error' });
        rerender(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.click(screen.getByText('chat.settings.webhooks.retry'));
        expect(h.retry).toHaveBeenCalled();

        setHook();
        rerender(<ChannelWebhooksSection channelId="C1" />);
        expect(screen.getByText('chat.settings.webhooks.empty')).toBeInTheDocument();
    });

    it('opens the issue dialog from the new-webhook row', () => {
        setHook();
        render(<ChannelWebhooksSection channelId="C1" />);
        expect(screen.getByTestId('issue')).toHaveAttribute('data-open', 'false');
        fireEvent.click(screen.getByText('chat.settings.webhooks.issue'));
        expect(screen.getByTestId('issue')).toHaveAttribute('data-open', 'true');
    });

    it('marks paused and expired rows and names an unnamed one', () => {
        setHook({
            webhooks: [row({ id: 'a', paused: true }), row({ id: 'b', expiresAt: 1 }), row({ id: 'c', name: '' })],
        });
        render(<ChannelWebhooksSection channelId="C1" />);
        expect(screen.getByText('chat.settings.webhooks.paused')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.webhooks.expired')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.webhooks.unnamed')).toBeInTheDocument();
    });

    it('pauses from the row sheet', async () => {
        const h = setHook({ webhooks: [row({ id: 'a' })] });
        render(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.click(screen.getByText('ci'));
        fireEvent.click(screen.getByText('chat.settings.webhooks.pause'));
        await waitFor(() => expect(h.setPaused).toHaveBeenCalledWith('a', true));
    });

    it('sets an expiry preset, with 0 for never', async () => {
        const h = setHook({ webhooks: [row({ id: 'a' })] });
        render(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.click(screen.getByText('ci'));
        fireEvent.click(screen.getByText(/chat.settings.webhooks.expiryNever/));
        await waitFor(() => expect(h.setExpiresAt).toHaveBeenCalledWith('a', 0));
    });

    it('toasts a failed write', async () => {
        setHook({ webhooks: [row()], setPaused: jest.fn().mockRejectedValue(new Error('403')) });
        render(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.click(screen.getByText('ci'));
        fireEvent.click(screen.getByText('chat.settings.webhooks.pause'));
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'chat.settings.webhooks.updateFailed', variant: 'destructive' })
        );
    });

    it('deletes only after the confirm', async () => {
        const h = setHook({ webhooks: [row({ id: 'a' })] });
        render(<ChannelWebhooksSection channelId="C1" />);
        fireEvent.click(screen.getByText('ci'));
        fireEvent.click(screen.getByText('chat.settings.webhooks.delete'));
        expect(h.remove).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('confirm:chat.settings.webhooks.delete'));
        await waitFor(() => expect(h.remove).toHaveBeenCalledWith('a'));
    });
});
