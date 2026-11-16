import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { IssueWebhookDialog } from './IssueWebhookDialog';

const toast = jest.fn();
const copy = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('../utils/copyMessageToClipboard', () => ({ copyMessageToClipboard: (text: string) => copy(text) }));
jest.mock('@chatic/ui-kit/components/ui/dialog', () => ({
    Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    DialogDescription: ({ children }: any) => <p>{children}</p>,
    DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

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

beforeEach(() => {
    toast.mockReset();
    copy.mockReset().mockResolvedValue(true);
});

describe('IssueWebhookDialog', () => {
    it('sends the trimmed name and 0 for never, then shows the token and endpoint', async () => {
        const onIssue = jest.fn().mockResolvedValue(issued);
        render(<IssueWebhookDialog open onOpenChange={jest.fn()} onIssue={onIssue} />);
        fireEvent.change(screen.getByPlaceholderText('chat.settings.webhooks.namePlaceholder'), {
            target: { value: '  ci ' },
        });
        fireEvent.click(screen.getByText('chat.settings.webhooks.create'));

        expect(await screen.findByText('wh:w:secret')).toBeInTheDocument();
        expect(onIssue).toHaveBeenCalledWith({ name: 'ci', expiresAt: 0 });
        expect(screen.getByText('https://api.example/hello/webhook')).toBeInTheDocument();

        fireEvent.click(screen.getAllByText('chat.settings.webhooks.copy')[0]);
        await waitFor(() => expect(copy).toHaveBeenCalledWith('wh:w:secret'));
    });

    it('says so when there is no endpoint', async () => {
        const onIssue = jest.fn().mockResolvedValue({ ...issued, location: undefined });
        render(<IssueWebhookDialog open onOpenChange={jest.fn()} onIssue={onIssue} />);
        fireEvent.click(screen.getByText('chat.settings.webhooks.create'));
        expect(await screen.findByText('chat.settings.webhooks.noEndpoint')).toBeInTheDocument();
    });

    it('drops the token when the dialog closes', async () => {
        const onIssue = jest.fn().mockResolvedValue(issued);
        const { rerender } = render(<IssueWebhookDialog open onOpenChange={jest.fn()} onIssue={onIssue} />);
        fireEvent.click(screen.getByText('chat.settings.webhooks.create'));
        await screen.findByText('wh:w:secret');

        rerender(<IssueWebhookDialog open={false} onOpenChange={jest.fn()} onIssue={onIssue} />);
        rerender(<IssueWebhookDialog open onOpenChange={jest.fn()} onIssue={onIssue} />);

        expect(screen.queryByText('wh:w:secret')).not.toBeInTheDocument();
        expect(screen.getByText('chat.settings.webhooks.create')).toBeInTheDocument();
    });

    it('toasts a failed create and stays on the form', async () => {
        render(
            <IssueWebhookDialog open onOpenChange={jest.fn()} onIssue={jest.fn().mockRejectedValue(new Error('403'))} />
        );
        fireEvent.click(screen.getByText('chat.settings.webhooks.create'));
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'chat.settings.webhooks.createFailed', variant: 'destructive' })
        );
        expect(screen.getByText('chat.settings.webhooks.create')).toBeInTheDocument();
    });
});
