import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ChannelMessageRow, type MessageReadInfo } from './ChannelMessageRow';
import type { ClientChatView } from '../types';
import { openExternalUrl } from '../utils/openExternalUrl';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

// Mocked rather than spied on: the real module reaches the bridge barrel, which pulls the whole
// app-runtime in at import time.
jest.mock('../utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));

// Same reason: the clipboard helper reaches the bridge barrel at import time.
jest.mock('../utils/copyMessageToClipboard', () => ({ copyMessageToClipboard: jest.fn().mockResolvedValue(true) }));

// Stubbed so these cases assert what the row decides — whether a preview is mounted and for which
// URL — rather than how the card resolves its metadata.
jest.mock('./MessageLinkPreview', () => ({
    MessageLinkPreview: ({ url }: any) => <div data-testid="link-preview" data-url={url} />,
}));

// Lightweight web-ui-kit stand-ins so assertions target ChannelMessageRow's own
// wiring (which avatar/size, which read-receipt counts) rather than library internals.
jest.mock('@chatic/web-ui-kit', () => ({
    InlineCode: ({ children }: any) => <code data-testid="inline-code">{children}</code>,
    // Faithful about the one thing the row cares about: buttonProps must land on the real button,
    // because that is what keeps a press on it away from the bubble's long-press gesture. That the
    // REAL CodeBlock forwards them is pinned in the kit's own test.
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
    // `data-expandable` surfaces the row's decision to offer "view all" — the real bubble
    // renders that affordance only when it gets an onExpand.
    MessageBubble: ({ children, onExpand }: any) => (
        <div data-testid="bubble" data-expandable={onExpand ? 'true' : 'false'}>
            {children}
        </div>
    ),
    // `data-wide` surfaces the row's decision to release the 75% bubble cap — a Block Kit
    // message lays itself out and has no bubble to cap. The REAL MessageRow honouring the
    // prop is pinned in the kit's own test.
    MessageRow: ({ avatar, status, children, wide }: any) => (
        <div data-testid="message-row" data-wide={wide ? 'true' : 'false'}>
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

// Stubbed: the real editor focuses and scrolls itself into view on mount, which jsdom cannot do.
// These cases only need the row to be in its edit state.
jest.mock('./MessageEditor', () => ({ MessageEditor: () => <div data-testid="message-editor" /> }));

// Stubbed so the image cases assert what the row decides — whether images are drawn, and in place of
// the bubble or under it — rather than how the tiles lay themselves out (pinned in the kit's tests).
// The tile is a real button so the long-press cases can tell a swallowed tap from one that opens the
// viewer, and the viewer is portalled to the body as the real Radix one is — React still bubbles its
// events through the row, which is the case the gesture has to ignore.
const mockOpenTile = jest.fn();
jest.mock('./MessageImages', () => {
    const { createPortal } = jest.requireActual('react-dom');
    return {
        MessageImages: ({ uploads, align }: any) => (
            <div data-testid="message-images" data-count={uploads?.length ?? 0} data-align={align}>
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

    // The list scrolls behind the bubbles, so the press handlers must leave the pan gesture alone.
    describe('the scroll gesture over a bubble', () => {
        const withContent = (content: string) => ({
            ...baseProps,
            message: { ...message, content } as unknown as ClientChatView,
        });
        const bubbleTrigger = () => screen.getByTestId('bubble').parentElement as HTMLElement;

        // jsdom has no PointerEvent, so testing-library builds a plain Event and drops
        // `pointerType` and the coordinates off the init — they have to be hung on the native
        // event by hand, or every assertion here reads a pointer with no type and no position.
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

        // fireEvent returns false when a listener called preventDefault. Cancelling a touch
        // pointerdown cancels the browser's panning with it, which is what stopped the thread
        // from scrolling wherever a finger landed on a message.
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

    describe('code in the bubble', () => {
        const withContent = (content: string) => ({
            ...baseProps,
            message: { ...message, content } as unknown as ClientChatView,
        });

        // The span wrapping the bubble carries the long-press handlers.
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

        // The riskiest interaction in this feature: the whole bubble is a long-press target, so a
        // press that starts on the copy button must not also open the action sheet.
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

        // The copy button must not swallow the CANCEL half of the gesture. A press begun on the code
        // text and released on the button would otherwise never reach clearTimer, and the sheet
        // would open on top of the copy — the exact outcome the button exists to prevent. Touch
        // hides this via implicit pointer capture; a mouse reproduces it.
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

        // A fence cut open by the 200-char bubble limit renders as a block rather than leaking
        // three stray backticks into the message.
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

    // A message another client soft-deleted (ADR-0047 decision 6). `apps/web` can only ever
    // read these — its own delete is a cache eviction for failed/pending rows — so the whole
    // contract here is "show that something was said, reveal none of it".
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

            // Bubble and author line survive: what is missing is the content, not the fact
            // that somebody spoke here.
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

        // The action sheet's Copy reads the original `content`, so leaving the gesture live
        // would hand the deleted text straight back to the clipboard.
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

    // A webhook send arrives as ordinary `stereo: 'user'` chat whose `content` is Block Kit
    // JSON (docs/specs/block-kit-messages.md §2). Without this branch the row hands that JSON
    // to MessageText and the reader sees the payload.
    describe('Block Kit content', () => {
        const blockMessage = (blocks: unknown[]) =>
            ({ ...message, content: JSON.stringify({ blocks }) }) as unknown as ClientChatView;

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

        // Two shapes of failure, one rule (SPEC §5): nothing drawable falls back to the original
        // body rather than stacking JSON fragments — and on this app the body is a bubble.
        it('falls back to the plain body when no block can be drawn', () => {
            render(<ChannelMessageRow {...baseProps} message={blockMessage([{ type: 'image', image_url: 'x' }])} />);

            expect(screen.getByTestId('bubble')).toBeInTheDocument();
            expect(screen.getByTestId('message-row')).toHaveAttribute('data-wide', 'false');
        });

        // That fallback bubble is a bubble like any other, so a long one still truncates —
        // the card is the only thing exempt, and exempting it must not exempt this too.
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

        // The unfurl reads what the reader can see, not the payload. A Slack link token
        // (`<url|label>`) shows only its label, so the URL inside it was never on screen —
        // unfurling it would card a page nobody was offered.
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

        // The card's links follow the bubble's rule. Left to the anchor's default, the native
        // shell loads the page into this WebView: DoU is replaced by it, with no way back.
        describe('links in the card', () => {
            const linkMessage = () =>
                blockMessage([
                    {
                        type: 'context',
                        elements: [{ type: 'mrkdwn', text: '<https://s3.example.com/r.json|원문 보기>' }],
                    },
                ]);
            // The span wrapping the card carries the long-press handlers.
            const cardTrigger = () => screen.getByRole('link').closest('.inline-flex') as HTMLElement;

            it('opens a tapped link outside the webview instead of following the anchor', () => {
                render(<ChannelMessageRow {...baseProps} message={linkMessage()} />);

                const followed = fireEvent.click(screen.getByRole('link', { name: '원문 보기' }));

                expect(followed).toBe(false);
                expect(openExternalUrl).toHaveBeenCalledWith('https://s3.example.com/r.json');
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

        // Three states the card must not take. A tombstone shows nothing of the body; a
        // pending or failed send is drawn BY the bubble (spinner, retry, destructive tint), and
        // a card would present an unlanded message as a finished one.
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

    // An image message with no text of its own must not leave an empty bubble beside its photos.
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

        // The images are the message: a photo gets the same sheet — reactions, a thread — as text.
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
            // `detail: 1` — a click a pointer produced, as the release of a hold does.
            fireEvent.click(screen.getByTestId('image-tile'), { detail: 1 });

            expect(props.onLongPress).toHaveBeenCalledTimes(1);
            expect(mockOpenTile).not.toHaveBeenCalled();
        });

        // A right-click leaves the flag set with no click to consume it; Enter on the focused tile
        // afterwards is a new act and must open the photo.
        it('does not swallow a keyboard activation after a right-click', () => {
            const props = { ...baseProps, onLongPress: jest.fn(), message: imageRow({}) };
            render(<ChannelMessageRow {...props} />);

            fireEvent.contextMenu(screen.getByTestId('image-tile'));
            fireEvent.click(screen.getByTestId('image-tile'), { detail: 0 });

            expect(mockOpenTile).toHaveBeenCalledTimes(1);
        });

        // The bubble is the editor then; a sheet from the images would offer Edit again and drop
        // the draft.
        it('does not open the sheet from the images of a message being edited', () => {
            const props = {
                ...baseProps,
                onLongPress: jest.fn(),
                message: imageRow({ content: '사진 보내요' }),
                edit: {
                    draft: '사진 보내요!',
                    onDraftChange: jest.fn(),
                    isSaving: false,
                    hasFailed: false,
                    onSave: jest.fn(),
                    onCancel: jest.fn(),
                },
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

        // The viewer is portalled out of the row's DOM but not out of its React tree.
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

    // The profile opened from a row must introduce the person exactly as the row did.
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

    // The avatar sits outside the bubble's press target, so a tap on it is not a hold.
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

    // A grouped follow-up draws a spacer where the avatar would be — nothing to press.
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
});
