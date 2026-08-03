import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ChannelMessageRow, type MessageReadInfo } from './ChannelMessageRow';
import type { ClientChatView } from '../types';
import { openExternalUrl } from '../utils/openExternalUrl';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

// Mocked rather than spied on: the real module reaches the bridge barrel, which pulls the whole
// app-runtime in at import time.
jest.mock('../utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));

// Stubbed so these cases assert what the row decides — whether a preview is mounted and for which
// URL — rather than how the card resolves its metadata.
jest.mock('./MessageLinkPreview', () => ({
    MessageLinkPreview: ({ url }: any) => <div data-testid="link-preview" data-url={url} />,
}));

// Lightweight web-ui-kit stand-ins so assertions target ChannelMessageRow's own
// wiring (which avatar/size, which read-receipt counts) rather than library internals.
jest.mock('@chatic/web-ui-kit', () => ({
    MessageBubble: ({ children }: any) => <div data-testid="bubble">{children}</div>,
    MessageRow: ({ avatar, status, children }: any) => (
        <div>
            <div data-testid="avatar-slot">{avatar}</div>
            <div data-testid="status-slot">{status}</div>
            {children}
        </div>
    ),
    ReadReceipt: ({ readCount, unreadCount }: any) => (
        <span data-testid="read-receipt" data-read={readCount} data-unread={unreadCount} />
    ),
    ImageAvatar: ({ src, size }: any) => <img data-testid="image-avatar" src={src} data-size={size} alt="" />,
    DefaultAvatar: ({ size }: any) => <div data-testid="default-avatar" data-size={size} />,
}));

jest.mock('@chatic/ui-kit', () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(' ') }));

jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));

const message = {
    id: 'm1',
    chatNo: 5,
    content: '안녕하세요',
    isOwner: false,
    isPending: false,
    isFailed: false,
    isSystem: false,
    timestamp: new Date('2026-07-20T02:58:00Z'),
    ownerId: 'u2',
    ownerName: '친구',
} as unknown as ClientChatView;

const read: MessageReadInfo = { show: true, isReady: true, readCount: 1, unreadCount: 99 };

const baseProps = {
    message,
    showProfileAndName: true,
    showTimeAndStatus: true,
    ownerDisplayName: '친구',
    ownerAvatar: undefined as string | undefined,
    time: '오전 11:58',
    read,
    isActionOpen: false,
    isCopying: false,
    onActionOpenChange: jest.fn(),
    onLongPress: jest.fn(),
    onCopy: jest.fn(),
    onExpand: jest.fn(),
    onRetry: jest.fn(),
    onDelete: jest.fn(),
};

describe('ChannelMessageRow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('passes both read and unread counts to the read receipt', () => {
        render(<ChannelMessageRow {...baseProps} />);

        const receipt = screen.getByTestId('read-receipt');
        expect(receipt).toHaveAttribute('data-read', '1');
        expect(receipt).toHaveAttribute('data-unread', '99');
    });

    it('renders a 32px ImageAvatar for a peer with an avatar', () => {
        render(<ChannelMessageRow {...baseProps} ownerAvatar="https://example.com/a.png" />);

        const avatar = screen.getByTestId('image-avatar');
        expect(avatar).toHaveAttribute('data-size', '32');
        expect(avatar).toHaveAttribute('src', 'https://example.com/a.png');
    });

    it('renders a 32px DefaultAvatar for a peer without an avatar', () => {
        render(<ChannelMessageRow {...baseProps} />);

        expect(screen.getByTestId('default-avatar')).toHaveAttribute('data-size', '32');
    });

    it('omits the read receipt when read.show is false', () => {
        render(<ChannelMessageRow {...baseProps} read={{ ...read, show: false }} />);

        expect(screen.queryByTestId('read-receipt')).not.toBeInTheDocument();
    });

    describe('links in the bubble', () => {
        const withContent = (content: string) => ({
            ...baseProps,
            message: { ...message, content } as unknown as ClientChatView,
        });

        // The span wrapping the bubble carries the long-press handlers.
        const bubbleTrigger = () => screen.getByTestId('bubble').parentElement as HTMLElement;

        it('renders a URL in the message as a tappable link', () => {
            render(<ChannelMessageRow {...withContent('보세요 https://example.com/a')} />);

            expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/a');
        });

        it('opens a tapped link outside the webview', () => {
            render(<ChannelMessageRow {...withContent('https://example.com/a')} />);

            fireEvent.click(screen.getByRole('link'));

            expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/a');
        });

        it('swallows the click that ends a long press, so the copy menu wins', () => {
            jest.useFakeTimers();
            try {
                const props = withContent('https://example.com/a');
                render(<ChannelMessageRow {...props} />);

                fireEvent.pointerDown(bubbleTrigger(), { pointerType: 'touch' });
                act(() => {
                    jest.advanceTimersByTime(500);
                });
                fireEvent.click(screen.getByRole('link'));

                expect(props.onLongPress).toHaveBeenCalled();
                expect(openExternalUrl).not.toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });

        it('opens the link on a short tap that never became a long press', () => {
            jest.useFakeTimers();
            try {
                const props = withContent('https://example.com/a');
                render(<ChannelMessageRow {...props} />);

                fireEvent.pointerDown(bubbleTrigger(), { pointerType: 'touch' });
                act(() => {
                    jest.advanceTimersByTime(100);
                });
                fireEvent.pointerUp(bubbleTrigger(), { pointerType: 'touch' });
                fireEvent.click(screen.getByRole('link'));

                expect(props.onLongPress).not.toHaveBeenCalled();
                expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/a');
            } finally {
                jest.useRealTimers();
            }
        });

        it('does not link a URL that the 200-char truncation cut in half', () => {
            const content = `${'가'.repeat(180)} https://example.com/a/very/long/path`;
            render(<ChannelMessageRow {...withContent(content)} />);

            expect(screen.queryByRole('link')).not.toBeInTheDocument();
            expect(screen.getByTestId('bubble')).toHaveTextContent('...');
        });

        it('still links a URL that fits entirely inside the truncated text', () => {
            const content = `https://example.com/a ${'가'.repeat(250)}`;
            render(<ChannelMessageRow {...withContent(content)} />);

            expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/a');
        });
    });

    describe('the preview card', () => {
        const withMessage = (fields: Partial<ClientChatView>) => ({
            ...baseProps,
            message: { ...message, ...fields } as unknown as ClientChatView,
        });

        it('unfurls the first URL only', () => {
            render(<ChannelMessageRow {...withMessage({ content: 'a https://one.com b https://two.com' })} />);

            const previews = screen.getAllByTestId('link-preview');
            expect(previews).toHaveLength(1);
            expect(previews[0]).toHaveAttribute('data-url', 'https://one.com');
        });

        it('mounts nothing for a message without a link', () => {
            render(<ChannelMessageRow {...baseProps} />);

            expect(screen.queryByTestId('link-preview')).not.toBeInTheDocument();
        });

        it.each([
            ['pending', { isPending: true }],
            ['failed', { isFailed: true }],
            ['system', { isSystem: true }],
        ])('mounts nothing while the message is %s', (_label, fields) => {
            render(<ChannelMessageRow {...withMessage({ content: 'https://example.com/a', ...fields })} />);

            expect(screen.queryByTestId('link-preview')).not.toBeInTheDocument();
        });

        it('still unfurls a link the bubble had to cut — the card is the only way to reach it', () => {
            const content = `${'가'.repeat(180)} https://example.com/a/very/long/path`;
            render(<ChannelMessageRow {...withMessage({ content })} />);

            expect(screen.queryByRole('link')).not.toBeInTheDocument();
            expect(screen.getByTestId('link-preview')).toHaveAttribute(
                'data-url',
                'https://example.com/a/very/long/path'
            );
        });

        it('sits outside the long-press target so taps on it are not eaten', () => {
            render(<ChannelMessageRow {...withMessage({ content: 'https://example.com/a' })} />);

            const longPressTarget = screen.getByTestId('bubble').parentElement as HTMLElement;
            expect(longPressTarget.contains(screen.getByTestId('link-preview'))).toBe(false);
        });
    });
});
