import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { ChannelMessageRow, type MessageReadInfo } from './ChannelMessageRow';
import type { ClientChatView } from '../types';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

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
});
