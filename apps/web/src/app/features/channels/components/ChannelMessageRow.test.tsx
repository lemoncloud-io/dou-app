import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ChannelMessageRow, type MessageReadInfo } from './ChannelMessageRow';
import type { ClientChatView } from '../types';
import { openExternalUrl } from '../utils/openExternalUrl';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

jest.mock('../utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));

jest.mock('../utils/copyMessageToClipboard', () => ({ copyMessageToClipboard: jest.fn().mockResolvedValue(true) }));

jest.mock('./MessageLinkPreview', () => ({
    MessageLinkPreview: ({ url }: any) => <div data-testid="link-preview" data-url={url} />,
}));

jest.mock('@chatic/web-ui-kit', () => ({
    InlineCode: ({ children }: any) => <code data-testid="inline-code">{children}</code>,
    CodeBlock: ({ code, lang, onCopy, copyLabel, buttonProps }: any) => (
        <span data-testid="code-block" data-lang={lang ?? ''}>
            {onCopy && (
                <button data-testid="code-copy" onClick={onCopy} {...buttonProps}>
                    {copyLabel}
                </button>
            )}
            <code>{code}</code>
        </span>
    ),
    MessageBubble: ({ children, onExpand }: any) => (
        <div data-testid="bubble" data-expandable={onExpand ? 'true' : 'false'}>
            {children}
        </div>
    ),
    MessageRow: ({ avatar, status, children, wide }: any) => (
        <div data-testid="message-row" data-wide={wide ? 'true' : 'false'}>
            <div data-testid="avatar-slot">{avatar}</div>
            <div data-testid="status-slot">{status}</div>
            {children}
        </div>
    ),
    ReadReceipt: ({ readCount, unreadCount, mode, readers }: any) => (
        <span
            data-testid="read-receipt"
            data-read={readCount}
            data-unread={unreadCount}
            data-mode={mode}
            data-faces={readers?.length ?? 0}
        />
    ),
    ImageAvatar: ({ src, size }: any) => <img data-testid="image-avatar" src={src} data-size={size} alt="" />,
    DefaultAvatar: ({ size }: any) => <div data-testid="default-avatar" data-size={size} />,
}));

jest.mock('@chatic/ui-kit', () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(' ') }));

const mockOpenTile = jest.fn();
jest.mock('./MessageImages', () => {
    const { createPortal } = jest.requireActual('react-dom');
    return {
        MessageImages: ({ uploads, align, hiddenSlots }: any) => (
            <div
                data-testid="message-images"
                data-count={uploads?.length ?? 0}
                data-align={align}
                data-hidden={hiddenSlots ? [...hiddenSlots].join(',') : ''}
            >
                <button data-testid="image-tile" onClick={mockOpenTile} />
                {createPortal(<div data-testid="image-viewer" />, document.body)}
            </div>
        ),
    };
});

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

    it("draws a group room's receipt as its own line with the readers' faces, not beside the time", () => {
        const mine = { ...message, isOwner: true } as unknown as ClientChatView;
        render(
            <ChannelMessageRow
                {...baseProps}
                message={mine}
                avatarOf={id => (id === 'u3' ? 'https://example.com/u3.png' : undefined)}
                read={{
                    show: true,
                    isReady: true,
                    readCount: 2,
                    unreadCount: 3,
                    mode: 'readers',
                    readers: ['u3', 'u4'],
                }}
            />
        );

        const receipt = screen.getByTestId('read-receipt');
        expect(receipt).toHaveAttribute('data-mode', 'readers');
        expect(receipt).toHaveAttribute('data-faces', '2');
        expect(screen.getByTestId('status-slot')).not.toContainElement(receipt);
    });

    it('draws no group receipt on a message still sending', () => {
        const pending = { ...message, isOwner: true, isPending: true } as unknown as ClientChatView;
        render(
            <ChannelMessageRow
                {...baseProps}
                message={pending}
                read={{ show: true, isReady: true, readCount: 0, unreadCount: 3, mode: 'readers', readers: [] }}
            />
        );

        expect(screen.queryByTestId('read-receipt')).not.toBeInTheDocument();
    });

    describe('the scroll gesture over a bubble', () => {
        const withContent = (content: string) => ({
            ...baseProps,
            message: { ...message, content } as unknown as ClientChatView,
        });
        const bubbleTrigger = () => screen.getByTestId('bubble').parentElement as HTMLElement;

        const pointer = (
            type: 'pointerdown' | 'pointermove',
            init: { pointerType?: string; x?: number; y?: number } = {}
        ) =>
            fireEvent(
                bubbleTrigger(),
                Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
                    pointerType: init.pointerType ?? 'touch',
                    button: 0,
                    clientX: init.x ?? 0,
                    clientY: init.y ?? 0,
                })
            );

        it('does not cancel the default of a touch pointerdown', () => {
            render(<ChannelMessageRow {...withContent('안녕')} />);

            const notCancelled = pointer('pointerdown', { pointerType: 'touch' });

            expect(notCancelled).toBe(true);
        });

        it('still cancels it for a mouse, where the default is a drag-select', () => {
            render(<ChannelMessageRow {...withContent('안녕')} />);

            const notCancelled = pointer('pointerdown', { pointerType: 'mouse' });

            expect(notCancelled).toBe(false);
        });

        it('drops the long press once the finger has travelled far enough to be a scroll', () => {
            jest.useFakeTimers();
            try {
                const props = withContent('안녕');
                render(<ChannelMessageRow {...props} />);

                pointer('pointerdown', { x: 100, y: 300 });
                pointer('pointermove', { x: 100, y: 240 });
                act(() => {
                    jest.advanceTimersByTime(1000);
                });

                expect(props.onLongPress).not.toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });

        it('keeps the long press through a fingertip wobble', () => {
            jest.useFakeTimers();
            try {
                const props = withContent('안녕');
                render(<ChannelMessageRow {...props} />);

                pointer('pointerdown', { x: 100, y: 300 });
                pointer('pointermove', { x: 102, y: 303 });
                act(() => {
                    jest.advanceTimersByTime(1000);
                });

                expect(props.onLongPress).toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });
    });

    describe('links in the bubble', () => {
        const withContent = (content: string) => ({
            ...baseProps,
            message: { ...message, content } as unknown as ClientChatView,
        });

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

    describe('code in the bubble', () => {
        const withContent = (content: string) => ({
            ...baseProps,
            message: { ...message, content } as unknown as ClientChatView,
        });

        const bubbleTrigger = () => screen.getByTestId('bubble').parentElement as HTMLElement;

        it('renders inline backticks as inline code', () => {
            render(<ChannelMessageRow {...withContent('배포는 `yarn deploy` 로')} />);

            expect(screen.getByTestId('inline-code')).toHaveTextContent('yarn deploy');
        });

        it('renders a fence as a code block carrying its language', () => {
            render(<ChannelMessageRow {...withContent('```ts\nconst x = 1;\n```')} />);

            const block = screen.getByTestId('code-block');
            expect(block).toHaveAttribute('data-lang', 'ts');
            expect(block).toHaveTextContent('const x = 1;');
        });

        it('does not link a URL inside a code block', () => {
            render(<ChannelMessageRow {...withContent("```\nfetch('https://api.example.com')\n```")} />);

            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        it('does not mount a preview card for a URL that only appears in code', () => {
            render(<ChannelMessageRow {...withContent('`https://api.example.com`')} />);

            expect(screen.queryByTestId('link-preview')).not.toBeInTheDocument();
        });

        it('gives the bubble block a copy button', () => {
            render(<ChannelMessageRow {...withContent('```\ncode\n```')} />);

            expect(screen.getByTestId('code-copy')).toBeInTheDocument();
        });

        it('a long press ON THE COPY BUTTON does not open the action sheet', () => {
            jest.useFakeTimers();
            try {
                const props = withContent('```\ncode\n```');
                render(<ChannelMessageRow {...props} />);

                fireEvent.pointerDown(screen.getByTestId('code-copy'), { pointerType: 'touch' });
                act(() => {
                    jest.advanceTimersByTime(1000);
                });

                expect(props.onLongPress).not.toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });

        it('a long press beside the button still opens the action sheet', () => {
            jest.useFakeTimers();
            try {
                const props = withContent('```\ncode\n```');
                render(<ChannelMessageRow {...props} />);

                fireEvent.pointerDown(bubbleTrigger(), { pointerType: 'touch' });
                act(() => {
                    jest.advanceTimersByTime(1000);
                });

                expect(props.onLongPress).toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });

        it('a press started on the code and released on the button cancels the long press', () => {
            jest.useFakeTimers();
            try {
                const props = withContent('```\ncode\n```');
                render(<ChannelMessageRow {...props} />);

                fireEvent.pointerDown(bubbleTrigger(), { pointerType: 'mouse', button: 0 });
                fireEvent.pointerUp(screen.getByTestId('code-copy'));
                act(() => {
                    jest.advanceTimersByTime(1000);
                });

                expect(props.onLongPress).not.toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });

        it('a right-click on the copy button does not open the action sheet', () => {
            const props = withContent('```\ncode\n```');
            render(<ChannelMessageRow {...props} />);

            fireEvent.contextMenu(screen.getByTestId('code-copy'));

            expect(props.onLongPress).not.toHaveBeenCalled();
        });

        it('renders a fence left open by truncation as a block', () => {
            const long = `${'가'.repeat(190)}\n\`\`\`ts\nconst x = 1;\nconst y = 2;`;
            render(<ChannelMessageRow {...withContent(long)} />);

            expect(screen.getByTestId('code-block')).toBeInTheDocument();
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

    describe('deleted message (tombstone)', () => {
        const deleted = (fields: Partial<ClientChatView> = {}) => ({
            ...baseProps,
            message: { ...message, hidden: true, ...fields } as unknown as ClientChatView,
        });

        it('renders the shared deleted phrase instead of the body', () => {
            render(<ChannelMessageRow {...deleted()} />);

            expect(screen.getByText('chat.room.deletedMessage')).toBeInTheDocument();
            expect(screen.queryByText('안녕하세요')).not.toBeInTheDocument();
        });

        it('keeps the row in place rather than closing the gap', () => {
            render(<ChannelMessageRow {...deleted()} />);

            expect(screen.getByTestId('bubble')).toBeInTheDocument();
            expect(screen.getByText('친구')).toBeInTheDocument();
        });

        it('does not unfurl a link the deleted body still carries', () => {
            render(<ChannelMessageRow {...deleted({ content: 'https://example.com/a' })} />);

            expect(screen.queryByTestId('link-preview')).not.toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        it('hides the reaction chips, so no live social surface survives the delete', () => {
            render(
                <ChannelMessageRow
                    {...deleted()}
                    reactions={[{ emoji: '👍', key: '👍', userIds: ['u2'], mine: false }]}
                    onToggleReaction={jest.fn()}
                />
            );

            expect(screen.queryByText('👍')).not.toBeInTheDocument();
        });

        it('drops the "view all" affordance even on a long deleted body', () => {
            render(<ChannelMessageRow {...deleted({ content: '가'.repeat(300) })} />);

            expect(screen.getByTestId('bubble')).toHaveAttribute('data-expandable', 'false');
        });

        it('does not open the action sheet on long press', () => {
            jest.useFakeTimers();
            try {
                const props = deleted();
                render(<ChannelMessageRow {...props} />);

                fireEvent.pointerDown(screen.getByTestId('bubble').parentElement as HTMLElement, {
                    pointerType: 'touch',
                });
                act(() => {
                    jest.advanceTimersByTime(600);
                });

                expect(props.onLongPress).not.toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });
    });

    it('shows an attach$-only message as its plain summary, with no attachment card', () => {
        const legacy = {
            ...message,
            stereo: 'webhook',
            content: 'error-report: example-api',
            attach$: { title: 'error-report', text: 'TypeError', sourceUrl: 'https://example.com/r.json' },
        } as unknown as ClientChatView;
        render(<ChannelMessageRow {...baseProps} message={legacy} />);

        expect(screen.getByText('error-report: example-api')).toBeInTheDocument();
        expect(screen.queryByText('TypeError')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    describe('Block Kit content', () => {
        const blockMessage = (blocks: unknown[]) =>
            ({ ...message, stereo: 'webhook', content: JSON.stringify({ blocks }) }) as unknown as ClientChatView;

        it("keeps a person's pasted payload as the text they sent, in a bubble", () => {
            const pasted = {
                ...blockMessage([{ type: 'header', text: { type: 'plain_text', text: '배포 실패' } }]),
                stereo: 'user',
            } as unknown as ClientChatView;
            render(<ChannelMessageRow {...baseProps} message={pasted} />);

            expect(screen.getByTestId('bubble')).toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: '배포 실패' })).not.toBeInTheDocument();
        });

        it('draws the blocks instead of the payload JSON', () => {
            render(
                <ChannelMessageRow
                    {...baseProps}
                    message={blockMessage([
                        { type: 'header', text: { type: 'plain_text', text: '배포 실패' } },
                        { type: 'section', text: { type: 'mrkdwn', text: '*503* upstream' } },
                    ])}
                />
            );

            expect(screen.getByText('배포 실패')).toBeInTheDocument();
            expect(screen.getByText('503')).toBeInTheDocument();
            expect(screen.queryByText(/"blocks"/)).not.toBeInTheDocument();
        });

        it('releases the bubble width cap and drops the bubble', () => {
            render(<ChannelMessageRow {...baseProps} message={blockMessage([{ type: 'divider' }])} />);

            expect(screen.getByTestId('message-row')).toHaveAttribute('data-wide', 'true');
            expect(screen.queryByTestId('bubble')).not.toBeInTheDocument();
        });

        it('falls back to the plain body when no block can be drawn', () => {
            render(<ChannelMessageRow {...baseProps} message={blockMessage([{ type: 'image', image_url: 'x' }])} />);

            expect(screen.getByTestId('bubble')).toBeInTheDocument();
            expect(screen.getByTestId('message-row')).toHaveAttribute('data-wide', 'false');
        });

        it('still truncates the fallback bubble when the payload is long', () => {
            const long = blockMessage([{ type: 'image', image_url: 'x'.repeat(400) }]);

            render(<ChannelMessageRow {...baseProps} message={long} />);

            expect(screen.getByTestId('bubble')).toHaveAttribute('data-expandable', 'true');
        });

        it('leaves an ordinary text message in its bubble', () => {
            render(<ChannelMessageRow {...baseProps} />);

            expect(screen.getByTestId('bubble')).toBeInTheDocument();
            expect(screen.getByTestId('message-row')).toHaveAttribute('data-wide', 'false');
        });

        it("badges the card with the sender's channel and gives it the sender's colour", () => {
            const { container } = render(
                <ChannelMessageRow
                    {...baseProps}
                    message={
                        {
                            ...blockMessage([{ type: 'header', text: { type: 'plain_text', text: '오늘 근태' } }]),
                            source$: { key: 'attendance', color: 'good' },
                        } as unknown as ClientChatView
                    }
                />
            );

            expect(screen.getByText('attendance').closest('.uppercase')).not.toBeNull();
            const card = screen.getByRole('heading', { name: '오늘 근태' }).parentElement as HTMLElement;
            expect(card.style.getPropertyValue('--block-kit-link-light')).toMatch(/^#[0-9A-F]{6}$/);
            expect(container.innerHTML).not.toContain('good');
        });

        it('draws the card with no badge when source$ is null', () => {
            render(
                <ChannelMessageRow
                    {...baseProps}
                    message={
                        {
                            ...blockMessage([{ type: 'header', text: { type: 'plain_text', text: 'Title' } }]),
                            source$: null,
                        } as unknown as ClientChatView
                    }
                />
            );

            expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
            expect(document.querySelector('.rounded-full')).toBeNull();
        });

        it('unfurls a URL the blocks actually show, not one hidden in a link token', () => {
            render(
                <ChannelMessageRow
                    {...baseProps}
                    message={blockMessage([
                        { type: 'section', text: { type: 'mrkdwn', text: '<https://runbook.example.com|런북>' } },
                        { type: 'section', text: { type: 'mrkdwn', text: '상세: https://status.example.com' } },
                    ])}
                />
            );

            const preview = screen.getByTestId('link-preview');
            expect(preview).toHaveAttribute('data-url', 'https://status.example.com');
        });

        describe('links in the card', () => {
            const linkMessage = () =>
                blockMessage([
                    {
                        type: 'context',
                        elements: [{ type: 'mrkdwn', text: '<https://s3.example.com/r.json|원문 보기>' }],
                    },
                ]);
            const cardTrigger = () => screen.getByRole('link').closest('.inline-flex') as HTMLElement;

            it('opens a tapped link outside the webview instead of following the anchor', () => {
                render(<ChannelMessageRow {...baseProps} message={linkMessage()} />);

                const followed = fireEvent.click(screen.getByRole('link', { name: 'chat.room.attachment.openSource' }));

                expect(followed).toBe(false);
                expect(openExternalUrl).toHaveBeenCalledWith('https://s3.example.com/r.json');
            });

            it("draws the server's source link as the card's last line and opens it outside the webview", () => {
                render(
                    <ChannelMessageRow
                        {...baseProps}
                        message={blockMessage([
                            { type: 'header', text: { type: 'plain_text', text: '503 ECONNRESET' } },
                            {
                                type: 'context',
                                elements: [{ type: 'mrkdwn', text: '<https://s3.example.com/report.json|원문 보기>' }],
                            },
                        ])}
                    />
                );

                expect(screen.queryByRole('link', { name: '원문 보기' })).not.toBeInTheDocument();
                const title = screen.getByRole('heading', { name: '503 ECONNRESET' });
                expect(title.closest('a')).toBeNull();
                const link = screen.getByRole('link', { name: 'chat.room.attachment.openSource' });
                expect(link.nextElementSibling).toBeNull();
                expect(link.previousElementSibling).toBe(title);
                const followed = fireEvent.click(link);

                expect(followed).toBe(false);
                expect(openExternalUrl).toHaveBeenCalledWith('https://s3.example.com/report.json');
            });

            it('reads source$.url first and shows the link once', () => {
                render(
                    <ChannelMessageRow
                        {...baseProps}
                        message={
                            {
                                ...blockMessage([
                                    { type: 'header', text: { type: 'plain_text', text: '배포 완료' } },
                                    {
                                        type: 'context',
                                        elements: [{ type: 'mrkdwn', text: '<https://old.example.com/r|원문 보기>' }],
                                    },
                                ]),
                                source$: { url: 'https://example.com/actions/runs/1' },
                            } as unknown as ClientChatView
                        }
                    />
                );

                const links = screen.getAllByRole('link');
                expect(links).toHaveLength(1);
                expect(links[0]).toHaveAttribute('href', 'https://example.com/actions/runs/1');
            });

            it('draws no source link when the source is not a web address', () => {
                render(
                    <ChannelMessageRow
                        {...baseProps}
                        message={blockMessage([
                            { type: 'header', text: { type: 'plain_text', text: '503 ECONNRESET' } },
                            {
                                type: 'context',
                                elements: [{ type: 'mrkdwn', text: '<javascript:alert(1)|원문 보기>' }],
                            },
                        ])}
                    />
                );

                expect(screen.getByRole('heading', { name: '503 ECONNRESET' }).closest('a')).toBeNull();
                expect(screen.queryByRole('link', { name: 'chat.room.attachment.openSource' })).not.toBeInTheDocument();
            });

            it('swallows the click that ends a long press, so the action sheet wins', () => {
                jest.useFakeTimers();
                try {
                    const props = { ...baseProps, message: linkMessage() };
                    render(<ChannelMessageRow {...props} />);

                    fireEvent.pointerDown(cardTrigger(), { pointerType: 'touch' });
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
        });

        it.each([
            ['deleted', { hidden: true }],
            ['pending', { isPending: true }],
            ['failed', { isFailed: true }],
        ])('keeps a %s message in its bubble even when the body is Block Kit', (_label, state) => {
            const withBlocks = {
                ...blockMessage([{ type: 'header', text: { type: 'plain_text', text: '배포 실패' } }]),
                ...state,
            } as unknown as ClientChatView;

            render(<ChannelMessageRow {...baseProps} message={withBlocks} />);

            expect(screen.getByTestId('bubble')).toBeInTheDocument();
            expect(screen.getByTestId('message-row')).toHaveAttribute('data-wide', 'false');
            expect(screen.queryByText('배포 실패')).not.toBeInTheDocument();
        });
    });
});

describe('ChannelMessageRow — image messages', () => {
    const uploads = [
        { id: 'u1', status: 'stored', orgUrl: 'https://s3/1' },
        { id: 'u2', status: 'stored', orgUrl: 'https://s3/2' },
    ];
    const imageRow = (extra: Record<string, unknown>) =>
        ({ ...message, content: '', upload$$: uploads, ...extra }) as unknown as ClientChatView;

    beforeEach(() => jest.clearAllMocks());

    it('draws the images in place of the bubble when there is no text', () => {
        render(<ChannelMessageRow {...baseProps} message={imageRow({})} />);

        expect(screen.getByTestId('message-images')).toHaveAttribute('data-count', '2');
        expect(screen.queryByTestId('bubble')).not.toBeInTheDocument();
    });

    it('keeps the bubble and draws the images under it when the message has text too', () => {
        render(<ChannelMessageRow {...baseProps} message={imageRow({ content: '사진 보내요' })} />);

        expect(screen.getByTestId('bubble')).toBeInTheDocument();
        expect(screen.getByTestId('message-images')).toBeInTheDocument();
    });

    it('sides my images with my bubbles', () => {
        render(<ChannelMessageRow {...baseProps} message={imageRow({ isOwner: true })} />);

        expect(screen.getByTestId('message-images')).toHaveAttribute('data-align', 'end');
    });

    it('draws no images on a deleted message', () => {
        render(<ChannelMessageRow {...baseProps} message={imageRow({ hidden: true })} />);

        expect(screen.queryByTestId('message-images')).not.toBeInTheDocument();
    });

    describe('long press on the images', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        const hold = (target: HTMLElement, ms = 500) => {
            fireEvent.pointerDown(target, { pointerType: 'touch' });
            act(() => {
                jest.advanceTimersByTime(ms);
            });
        };

        it('opens the action sheet on an image-only message', () => {
            const props = { ...baseProps, onLongPress: jest.fn(), message: imageRow({}) };
            render(<ChannelMessageRow {...props} />);

            hold(screen.getByTestId('image-tile'));

            expect(props.onLongPress).toHaveBeenCalledTimes(1);
        });

        it('opens it on the images that sit under a text bubble too', () => {
            const props = { ...baseProps, onLongPress: jest.fn(), message: imageRow({ content: '사진 보내요' }) };
            render(<ChannelMessageRow {...props} />);

            hold(screen.getByTestId('image-tile'));

            expect(props.onLongPress).toHaveBeenCalledTimes(1);
        });

        it('opens it on a right-click', () => {
            const props = { ...baseProps, onLongPress: jest.fn(), message: imageRow({}) };
            render(<ChannelMessageRow {...props} />);

            fireEvent.contextMenu(screen.getByTestId('image-tile'));

            expect(props.onLongPress).toHaveBeenCalledTimes(1);
        });

        it('swallows the tap that ends the hold, so the viewer does not open under the sheet', () => {
            const props = { ...baseProps, onLongPress: jest.fn(), message: imageRow({}) };
            render(<ChannelMessageRow {...props} />);

            hold(screen.getByTestId('image-tile'));
            fireEvent.click(screen.getByTestId('image-tile'), { detail: 1 });

            expect(props.onLongPress).toHaveBeenCalledTimes(1);
            expect(mockOpenTile).not.toHaveBeenCalled();
        });

        it('does not swallow a keyboard activation after a right-click', () => {
            const props = { ...baseProps, onLongPress: jest.fn(), message: imageRow({}) };
            render(<ChannelMessageRow {...props} />);

            fireEvent.contextMenu(screen.getByTestId('image-tile'));
            fireEvent.click(screen.getByTestId('image-tile'), { detail: 0 });

            expect(mockOpenTile).toHaveBeenCalledTimes(1);
        });

        it('does not open the sheet from the images of a message being edited', () => {
            const props = {
                ...baseProps,
                onLongPress: jest.fn(),
                message: imageRow({ content: '사진 보내요' }),
                isEditTarget: true,
            };
            render(<ChannelMessageRow {...props} />);

            hold(screen.getByTestId('image-tile'));
            fireEvent.contextMenu(screen.getByTestId('image-tile'));

            expect(props.onLongPress).not.toHaveBeenCalled();
        });

        it('lets a short tap through to open the viewer', () => {
            const props = { ...baseProps, onLongPress: jest.fn(), message: imageRow({}) };
            render(<ChannelMessageRow {...props} />);

            hold(screen.getByTestId('image-tile'), 100);
            fireEvent.pointerUp(screen.getByTestId('image-tile'), { pointerType: 'touch' });
            fireEvent.click(screen.getByTestId('image-tile'));

            expect(props.onLongPress).not.toHaveBeenCalled();
            expect(mockOpenTile).toHaveBeenCalledTimes(1);
        });

        it('ignores a hold or right-click inside the open viewer', () => {
            const props = { ...baseProps, onLongPress: jest.fn(), message: imageRow({}) };
            render(<ChannelMessageRow {...props} />);

            hold(screen.getByTestId('image-viewer'));
            fireEvent.contextMenu(screen.getByTestId('image-viewer'));

            expect(props.onLongPress).not.toHaveBeenCalled();
        });
    });
});

describe('ChannelMessageRow — opening the sender profile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const avatarButton = () => screen.queryByRole('button', { name: 'chat.room.openProfile' });

    it('hands the profile the name and photo the row drew, from the avatar', () => {
        const onOpenProfile = jest.fn();
        render(
            <ChannelMessageRow
                {...baseProps}
                ownerDisplayName="프로필 닉"
                ownerAvatar="https://example.com/a.png"
                onOpenProfile={onOpenProfile}
            />
        );

        fireEvent.click(avatarButton() as HTMLElement);

        expect(onOpenProfile).toHaveBeenCalledWith({
            id: 'u2',
            name: '프로필 닉',
            avatar: 'https://example.com/a.png',
        });
    });

    it('opens the same profile from the sender name', () => {
        const onOpenProfile = jest.fn();
        render(<ChannelMessageRow {...baseProps} onOpenProfile={onOpenProfile} />);

        fireEvent.click(screen.getByText('친구'));

        expect(onOpenProfile).toHaveBeenCalledWith({ id: 'u2', name: '친구', avatar: undefined });
    });

    it('does not open the action sheet from the avatar', () => {
        render(<ChannelMessageRow {...baseProps} onOpenProfile={jest.fn()} />);

        fireEvent.contextMenu(avatarButton() as HTMLElement);

        expect(baseProps.onLongPress).not.toHaveBeenCalled();
    });

    it('is inert on my own row', () => {
        const onOpenProfile = jest.fn();
        render(
            <ChannelMessageRow
                {...baseProps}
                message={{ ...message, isOwner: true } as unknown as ClientChatView}
                onOpenProfile={onOpenProfile}
            />
        );

        expect(avatarButton()).not.toBeInTheDocument();
    });

    it('is inert for a webhook message', () => {
        render(
            <ChannelMessageRow
                {...baseProps}
                message={{ ...message, stereo: 'webhook' } as unknown as ClientChatView}
                onOpenProfile={jest.fn()}
            />
        );

        expect(avatarButton()).not.toBeInTheDocument();
    });

    it('is inert on a grouped follow-up row', () => {
        render(<ChannelMessageRow {...baseProps} showProfileAndName={false} onOpenProfile={jest.fn()} />);

        expect(avatarButton()).not.toBeInTheDocument();
        expect(screen.queryByText('친구')).not.toBeInTheDocument();
    });

    it('is inert for a row with no owner id', () => {
        render(
            <ChannelMessageRow
                {...baseProps}
                message={{ ...message, ownerId: undefined } as unknown as ClientChatView}
                onOpenProfile={jest.fn()}
            />
        );

        expect(avatarButton()).not.toBeInTheDocument();
    });

    it('stays a plain avatar and name without a handler', () => {
        render(<ChannelMessageRow {...baseProps} />);

        expect(avatarButton()).not.toBeInTheDocument();
        expect(screen.getByText('친구').tagName).toBe('SPAN');
    });
    describe('mentions', () => {
        const viewer = {
            ids: ['me-cloud', 'me'],
            tokens: ['@레인', '@channel'],
            roomTokens: ['@레인', '@Minsu', '@channel'],
            people: new Map([['@minsu', { id: 'u2', name: 'Minsu', avatar: 'https://example.test/minsu.png' }]]),
        };
        const mentioning = (fields: Partial<ClientChatView>) =>
            ({ ...message, content: '@레인 @Minsu 확인해 줘', ...fields }) as ClientChatView;
        const mark = (word: string) => screen.queryByText(word, { selector: 'span, button' });

        it("draws every member's mention, and mine louder by the text when there is no record", () => {
            render(<ChannelMessageRow {...baseProps} message={mentioning({})} mentionViewer={viewer} />);

            expect(mark('@Minsu')).toHaveClass('text-brand-ink');
            expect(mark('@레인')).toHaveClass('bg-primary/40');
        });

        it('draws my name louder only when the record names one of my ids', () => {
            const { unmount } = render(
                <ChannelMessageRow
                    {...baseProps}
                    message={mentioning({ mention$: { userIds: ['me-cloud'] } })}
                    mentionViewer={viewer}
                />
            );
            expect(mark('@레인')).toHaveClass('bg-primary/40');
            expect(mark('@Minsu')).toHaveClass('text-brand-ink');
            unmount();

            render(
                <ChannelMessageRow
                    {...baseProps}
                    message={mentioning({ mention$: { userIds: ['someone-else'] } })}
                    mentionViewer={viewer}
                />
            );
            expect(mark('@레인')).not.toHaveClass('bg-primary/40');
        });

        it('draws my own message in the mark for my bubble, even one calling everyone', () => {
            render(
                <ChannelMessageRow
                    {...baseProps}
                    message={mentioning({ isOwner: true, mention$: { all: true } })}
                    mentionViewer={viewer}
                />
            );

            expect(mark('@레인')).toHaveClass('text-primary');
            expect(mark('@레인')).not.toHaveClass('bg-primary/40');
        });

        it("opens the named member's profile on a tap of their mention", () => {
            const onOpenProfile = jest.fn();
            render(
                <ChannelMessageRow
                    {...baseProps}
                    message={mentioning({})}
                    mentionViewer={viewer}
                    onOpenProfile={onOpenProfile}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: '@Minsu' }));

            expect(onOpenProfile).toHaveBeenCalledWith({
                id: 'u2',
                name: 'Minsu',
                avatar: 'https://example.test/minsu.png',
            });
        });

        it('draws nothing when the row is not told who is reading', () => {
            render(<ChannelMessageRow {...baseProps} message={mentioning({ mention$: { all: true } })} />);

            expect(mark('@레인')).not.toBeInTheDocument();
        });
    });

    describe('the message being edited', () => {
        const mine = { ...message, isOwner: true, updatedAt: 2, createdAt: 1 } as unknown as ClientChatView;
        let scrollIntoView: jest.Mock;
        beforeEach(() => {
            scrollIntoView = jest.fn();
            Element.prototype.scrollIntoView = scrollIntoView;
        });

        it('keeps drawing its text in the bubble rather than a field', () => {
            render(<ChannelMessageRow {...baseProps} message={mine} isEditTarget />);

            expect(screen.getByTestId('bubble')).toHaveTextContent('안녕하세요');
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        });

        it('marks itself so the list shows which message is changing', () => {
            const { rerender } = render(<ChannelMessageRow {...baseProps} message={mine} />);
            const trigger = screen.getByTestId('bubble').parentElement as HTMLElement;
            expect(trigger).not.toHaveAttribute('data-edit-target');

            rerender(<ChannelMessageRow {...baseProps} message={mine} isEditTarget />);
            expect(trigger).toHaveAttribute('data-edit-target', 'true');
        });

        it('brings itself into view once when the edit starts', () => {
            const { rerender } = render(<ChannelMessageRow {...baseProps} message={mine} />);
            expect(scrollIntoView).not.toHaveBeenCalled();

            rerender(<ChannelMessageRow {...baseProps} message={mine} isEditTarget />);
            rerender(<ChannelMessageRow {...baseProps} message={mine} isEditTarget time="오후 1:00" />);

            expect(scrollIntoView).toHaveBeenCalledTimes(1);
        });

        it('does not open the action sheet from its bubble', () => {
            jest.useFakeTimers();
            try {
                const props = { ...baseProps, onLongPress: jest.fn(), message: mine, isEditTarget: true };
                render(<ChannelMessageRow {...props} />);

                fireEvent.contextMenu(screen.getByTestId('bubble').parentElement as HTMLElement);

                expect(props.onLongPress).not.toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });

        it('hides the edited marker while it is being edited', () => {
            const { rerender } = render(<ChannelMessageRow {...baseProps} message={mine} />);
            expect(screen.getByText('chat.room.edited')).toBeInTheDocument();

            rerender(<ChannelMessageRow {...baseProps} message={mine} isEditTarget />);
            expect(screen.queryByText('chat.room.edited')).not.toBeInTheDocument();
        });
    });
});

describe('ChannelMessageRow — items hidden on this device', () => {
    const photo = (id: string) => ({ id, status: 'stored', orgUrl: `https://s3/${id}` });
    const row = (extra: Record<string, unknown>) =>
        ({
            ...message,
            channelId: 'ch-1',
            content: '',
            upload$$: [photo('u1')],
            ...extra,
        }) as unknown as ClientChatView;
    const renderRow = (extra: Record<string, unknown>, hidden: string[]) =>
        render(<ChannelMessageRow {...baseProps} message={row(extra)} hiddenMedia={new Set(hidden)} />);

    beforeEach(() => jest.clearAllMocks());

    it('leaves out a hidden attachment and keeps the text', () => {
        renderRow({ content: '사진 보내요' }, ['ch-1:5:0']);

        expect(screen.queryByTestId('message-images')).not.toBeInTheDocument();
        expect(screen.getByTestId('bubble')).toHaveTextContent('사진 보내요');
    });

    it('tells the tiles which slot to leave out when others are still shown', () => {
        renderRow({ upload$$: [photo('u1'), photo('u2')] }, ['ch-1:5:1']);

        expect(screen.getByTestId('message-images')).toHaveAttribute('data-hidden', '1');
    });

    it('draws nothing of a message whose only attachment is hidden and which has no text', () => {
        const { container } = renderRow({}, ['ch-1:5:0']);

        expect(container).toBeEmptyDOMElement();
    });

    it('ignores keys of another room or another message', () => {
        renderRow({}, ['ch-2:5:0', 'ch-1:6:0']);

        expect(screen.getByTestId('message-images')).toHaveAttribute('data-hidden', '');
    });

    it('drops the preview card of a hidden link, keeping the text and the attachment', () => {
        renderRow({ content: 'look https://one.com' }, ['ch-1:5:1']);

        expect(screen.queryByTestId('link-preview')).not.toBeInTheDocument();
        expect(screen.getByTestId('bubble')).toHaveTextContent('look https://one.com');
        expect(screen.getByTestId('message-images')).toBeInTheDocument();
    });

    it('keeps the preview card when only the attachment is hidden', () => {
        renderRow({ content: 'look https://one.com' }, ['ch-1:5:0']);

        expect(screen.getByTestId('link-preview')).toHaveAttribute('data-url', 'https://one.com');
        expect(screen.queryByTestId('message-images')).not.toBeInTheDocument();
    });
});

describe('ChannelMessageRow — a failed audio message of mine', () => {
    const failedSlot = (localContentType: string, localName: string) => ({
        localStatus: 'failed',
        localContentType,
        localName,
    });
    const failed = (slot: Record<string, unknown>) =>
        ({
            ...message,
            channelId: 'ch-1',
            chatNo: undefined,
            content: '',
            isOwner: true,
            isFailed: true,
            upload$$: [slot],
        }) as unknown as ClientChatView;

    beforeEach(() => jest.clearAllMocks());

    it('leaves the failure and its buttons to the bubble', () => {
        render(
            <ChannelMessageRow {...baseProps} message={failed(failedSlot('audio/mp4', 'voice-20261102-101500.m4a'))} />
        );

        expect(screen.getByTestId('message-images')).toBeInTheDocument();
        expect(screen.queryByTitle('chat.room.retry')).not.toBeInTheDocument();
        expect(screen.queryByTitle('chat.room.delete')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.room.failed')).not.toBeInTheDocument();
        expect(screen.getByTestId('status-slot')).toBeEmptyDOMElement();
    });

    it('still draws the row’s own retry and delete for a failed photo', () => {
        render(<ChannelMessageRow {...baseProps} message={failed(failedSlot('image/jpeg', 'a.jpg'))} />);

        expect(screen.getByTitle('chat.room.retry')).toBeInTheDocument();
        expect(screen.getByTitle('chat.room.delete')).toBeInTheDocument();
    });

    it('still draws them for a failed audio message that has text', () => {
        const withText = {
            ...failed(failedSlot('audio/mp4', 'voice-20261102-101500.m4a')),
            content: 'listen',
        } as ClientChatView;
        render(<ChannelMessageRow {...baseProps} message={withText} />);

        expect(screen.getByTitle('chat.room.retry')).toBeInTheDocument();
    });
});
