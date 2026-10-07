import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type { useThreadRoot as UseThreadRoot } from '../hooks/useThreadRoot';

const getChat = vi.fn();
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn(), getChat },
            }),
        },
        session: {
            getActiveServerContext: () => ({ kind: 'cloud', siteId: 'S1' }),
            useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
            useSessionSelection: () => ({ selectedSiteId: 'S1' }),
        },
    },
}));

let messages: DomainChat[] = [];
const loadOlder = vi.fn();
let hasMore = false;
vi.mock('../../../shared/hooks/useChats', () => ({
    useChats: () => ({ messages, isLoading: false, loadOlder, hasMore, isLoadingOlder: false }),
}));
const composerSend = vi.fn();
const useComposerSend = vi.fn((_target: unknown) => ({ send: composerSend }));
const clearTray = vi.fn();
vi.mock('../../../shared/hooks/useAuthorNames', () => ({ useAuthorNames: () => new Map() }));
vi.mock('../../../shared/hooks/usePanelWidth', () => ({
    usePanelWidth: () => ({ width: 384, minWidth: 280, maxWidth: 640, panelRef: { current: null } }),
}));
// The hook under the panel is the real one — the panel's states are what it reports.
vi.mock('../hooks', async () => ({
    useThreadRoot: (await vi.importActual<{ useThreadRoot: typeof UseThreadRoot }>('../hooks/useThreadRoot'))
        .useThreadRoot,
    useMentionables: () => [],
    useMessageViewer: () => ({ uid: 'me', name: 'Me', cloudUid: 'me-cloud' }),
    useMessageActions: () => ({ editMessage: vi.fn(), deleteMessage: vi.fn(), failedId: null }),
    useReactions: () => ({ toggleReaction: vi.fn(), failedId: null }),
    useImageAttachments: () => ({
        attachments: [],
        addFiles: vi.fn(),
        remove: vi.fn(),
        clear: clearTray,
    }),
    useFileDrop: () => ({ isDragging: false, dropHandlers: {} }),
    useChatImages: () => [],
    useComposerSend: (target: unknown) => useComposerSend(target),
}));
// The composer is a rich-text editor with its own runtime needs; this file is about
// what the panel renders above it — and what it does with a reply the composer hands up.
let composerOnSend: ((content: string, files: File[]) => void) | undefined;
vi.mock('./Composer', () => ({
    Composer: ({ onSend }: { onSend: (content: string, files: File[]) => void }) => {
        composerOnSend = onSend;
        return null;
    },
}));

import '../../../../i18n';

import { ThreadPanel } from './ThreadPanel';
import { WEBHOOK_BLOCKS_ERROR_REPORT, WEBHOOK_SEND_ERROR_REPORT } from '@chatic/block-kit';

Element.prototype.scrollIntoView = vi.fn();

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const CHANNEL = { id: 'C1', name: 'general' } as DomainChannel;

const chat = (chatNo: number, extra: Partial<DomainChat>): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        ownerId: 'ada',
        createdAt: 1_700_000_000_000 + chatNo,
        ...extra,
    }) as DomainChat;

// A root, one reply, and someone's 👍 on the root — the reaction arrives as its own chat.
const THREAD_WITH_REACTION: DomainChat[] = [
    chat(1, { content: 'root' }),
    chat(2, { content: 'reply', parentId: 'C1:1' }),
    chat(3, {
        ownerId: 'bob',
        subType: 'reaction',
        parentId: 'C1:1',
        reaction$: { chatId: 'C1:1', emoji: '👍', action: 'on' },
    } as Partial<DomainChat>),
];

describe('ThreadPanel', () => {
    beforeEach(() => {
        getChat.mockReset();
        loadOlder.mockReset().mockResolvedValue(true);
        hasMore = false;
        useComposerSend.mockClear();
    });

    describe('a root older than the loaded window', () => {
        // Newest page of a long channel: the thread's root (chat 5) is far below it.
        const WINDOW: DomainChat[] = [chat(100, { content: 'recent' }), chat(101, { content: 'recent too' })];

        it('fetches the root itself and shows it with its composer, without asking the reader to scroll', async () => {
            messages = WINDOW;
            getChat.mockResolvedValue(chat(5, { content: 'an old question' }));

            render(<ThreadPanel channel={CHANNEL} rootId="5" members={[]} />, { wrapper });

            expect(await screen.findByText('an old question')).toBeTruthy();
            expect(getChat).toHaveBeenCalledWith({ id: 'C1:5' });
            expect(useComposerSend).toHaveBeenLastCalledWith({ cid: 'default', channelId: 'C1', parentId: 'C1:5' });
            expect(screen.queryByText(/Scroll up in the channel/)).toBeNull();
        });

        it('shows a loading state while the root is on its way', async () => {
            messages = WINDOW;
            getChat.mockReturnValue(new Promise(() => undefined));

            render(<ThreadPanel channel={CHANNEL} rootId="5" members={[]} />, { wrapper });

            await waitFor(() => expect(getChat).toHaveBeenCalled());
            expect(screen.getByRole('status').textContent).toMatch(/loading/i);
            expect(screen.queryByText(/Scroll up in the channel/)).toBeNull();
        });
    });

    describe('a root the panel cannot show', () => {
        const WINDOW: DomainChat[] = [chat(100, { content: 'recent' })];
        const withJoin = (joinedNo: number) => ({ ...CHANNEL, $join: { joinedNo } }) as unknown as DomainChannel;

        it('says a message from before I joined cannot be viewed, and asks for nothing', () => {
            messages = WINDOW;

            render(<ThreadPanel channel={withJoin(10)} rootId="5" members={[]} />, { wrapper });

            expect(screen.getByRole('status').textContent).toMatch(/before you joined/);
            expect(getChat).not.toHaveBeenCalled();
            expect(loadOlder).not.toHaveBeenCalled();
            expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
        });

        it('says a deleted or forbidden message is gone, with no retry', async () => {
            messages = WINDOW;
            getChat.mockRejectedValue(new Error('404 NOT FOUND'));

            render(<ThreadPanel channel={CHANNEL} rootId="5" members={[]} />, { wrapper });

            expect(await screen.findByText(/can't be shown here/)).toBeTruthy();
            expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
        });

        it('offers a retry after a network failure, and the retry asks again', async () => {
            messages = WINDOW;
            getChat.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(chat(5, { content: 'back' }));

            render(<ThreadPanel channel={CHANNEL} rootId="5" members={[]} />, { wrapper });
            fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

            expect(await screen.findByText('back')).toBeTruthy();
            expect(getChat).toHaveBeenCalledTimes(2);
        });
    });

    describe('replies below the loaded window', () => {
        // The window starts at 500; the root is 5, so the replies in between are still out there.
        const FAR_WINDOW: DomainChat[] = [
            chat(500, { content: 'recent reply', parentId: '5' }),
            chat(501, { content: 'later chatter' }),
        ];

        it('shows the root, the replies so far and the composer while loading earlier replies', async () => {
            messages = FAR_WINDOW;
            hasMore = true;
            getChat.mockResolvedValue(chat(5, { content: 'the root' }));

            render(<ThreadPanel channel={CHANNEL} rootId="5" members={[]} />, { wrapper });

            expect(await screen.findByText('the root')).toBeTruthy();
            expect(screen.getByText('recent reply')).toBeTruthy();
            expect(screen.getByText('Loading earlier replies…')).toBeTruthy();
            expect(loadOlder).toHaveBeenCalledTimes(1);
            expect(useComposerSend).toHaveBeenLastCalledWith({ cid: 'default', channelId: 'C1', parentId: 'C1:5' });
        });

        it('counts only what is loaded while earlier replies are out, and the whole thread once they are in', async () => {
            messages = FAR_WINDOW;
            hasMore = true;
            getChat.mockResolvedValue(chat(5, { content: 'the root' }));
            const panel = () => <ThreadPanel channel={CHANNEL} rootId="5" members={[]} />;

            const view = render(panel(), { wrapper });
            await screen.findByText('the root');

            expect(screen.getByText('1 reply loaded')).toBeTruthy();
            expect(screen.queryByText('1 reply')).toBeNull();

            // The window reaches the root: the thread is whole, so the count is the thread's.
            messages = [chat(5, { content: 'the root' }), ...FAR_WINDOW];
            view.rerender(panel());

            expect(await screen.findByText('1 reply')).toBeTruthy();
        });

        it('does not ask again when the channel record is replaced by an equal one', async () => {
            messages = FAR_WINDOW;
            hasMore = true;
            getChat.mockResolvedValue(chat(5, { content: 'the root' }));

            const view = render(<ThreadPanel channel={CHANNEL} rootId="5" members={[]} />, { wrapper });
            await screen.findByText('the root');
            // A place switch hands the panel a fresh object for the same channel when the list returns.
            view.rerender(<ThreadPanel channel={{ ...CHANNEL }} rootId="5" members={[]} />);

            expect(screen.getByText('the root')).toBeTruthy();
            expect(getChat).toHaveBeenCalledTimes(1);
            expect(loadOlder).toHaveBeenCalledTimes(1);
        });

        it('stops after a batch and loads one more batch per press', async () => {
            const windowFrom = (oldest: number): DomainChat[] => [
                chat(oldest, { content: `window starts at ${oldest}` }),
                chat(900, { content: 'recent reply', parentId: '5' }),
            ];
            messages = windowFrom(800);
            hasMore = true;
            getChat.mockResolvedValue(chat(5, { content: 'the root' }));
            // A fresh element each time: React skips a re-render for the very same one.
            const panel = () => <ThreadPanel channel={CHANNEL} rootId="5" members={[]} />;

            const view = render(panel(), { wrapper });
            await screen.findByText('the root');
            // Each landed page re-emits the window 50 messages further back.
            const land = (from: number) => {
                messages = windowFrom(from);
                view.rerender(panel());
            };
            land(750);
            land(700);
            land(650);
            land(600);
            land(550);

            const more = await screen.findByRole('button', { name: 'Load earlier replies' });
            expect(loadOlder).toHaveBeenCalledTimes(5);
            expect(screen.getByText('the root')).toBeTruthy();
            expect(screen.getByText('recent reply')).toBeTruthy();
            // The root being there, replying stays possible however much is still out.
            expect(useComposerSend).toHaveBeenLastCalledWith({ cid: 'default', channelId: 'C1', parentId: 'C1:5' });

            fireEvent.click(more);
            expect(loadOlder).toHaveBeenCalledTimes(6);
            expect(screen.queryByRole('button', { name: 'Load earlier replies' })).toBeNull();
        });

        it('keeps what is shown when an earlier page fails, and the row retries', async () => {
            messages = FAR_WINDOW;
            hasMore = true;
            loadOlder.mockResolvedValueOnce(false).mockResolvedValue(true);
            getChat.mockResolvedValue(chat(5, { content: 'the root' }));

            render(<ThreadPanel channel={CHANNEL} rootId="5" members={[]} />, { wrapper });
            const retry = await screen.findByRole('button', { name: 'Try again' });

            expect(screen.getByText('the root')).toBeTruthy();
            expect(screen.getByText('recent reply')).toBeTruthy();
            expect(screen.getByText("Couldn't load earlier replies.")).toBeTruthy();
            expect(useComposerSend).toHaveBeenLastCalledWith({ cid: 'default', channelId: 'C1', parentId: 'C1:5' });

            fireEvent.click(retry);
            expect(loadOlder).toHaveBeenCalledTimes(2);
        });

        it('has no row when the root is in the window', () => {
            messages = [chat(5, { content: 'the root' }), chat(6, { content: 'a reply', parentId: '5' })];
            hasMore = true;

            render(<ThreadPanel channel={CHANNEL} rootId="5" members={[]} />, { wrapper });

            expect(screen.queryByText('Loading earlier replies…')).toBeNull();
            expect(screen.queryByRole('button', { name: 'Load earlier replies' })).toBeNull();
            expect(getChat).not.toHaveBeenCalled();
        });
    });

    it('shows the reactions on a threaded message', () => {
        // The server keeps no reaction state: the tallies are folded out of the loaded feed. The
        // panel renders the same messages as the feed, so a message with reactions has to carry
        // them here too.
        messages = THREAD_WITH_REACTION;

        render(<ThreadPanel channel={CHANNEL} rootId="C1:1" members={[]} />, { wrapper });

        // The chip, not the toolbar's quick-reaction button: only the chip is labelled
        // "<emoji> · <reactors>", and only the chip means the reaction is on the message.
        expect(screen.getByLabelText(/^👍 ·/)).toBeTruthy();
    });

    // Same renderer as the feed. A reply that arrives as Block Kit is drawn here for
    // free — this pins that, so a future surface cannot quietly grow its own path.
    it('draws a Block Kit reply', () => {
        messages = [
            chat(1, { content: 'root' }),
            chat(2, {
                parentId: 'C1:1',
                content: JSON.stringify({
                    blocks: [{ type: 'header', text: { type: 'plain_text', text: 'Error report' } }],
                }),
            }),
        ];

        render(<ThreadPanel channel={CHANNEL} rootId="C1:1" members={[]} />, { wrapper });

        expect(screen.getByRole('heading', { name: 'Error report' })).toBeTruthy();
    });

    // Same renderer, and `blocks$` (server field) outranks `content` JSON. `MessageList.spec`
    // asserts the same thing through
    // the feed; this pins that the thread panel does not grow a second reader.
    it('draws a blocks$ reply ahead of its content', () => {
        messages = [
            chat(1, { content: 'root' }),
            chat(2, {
                parentId: 'C1:1',
                content: WEBHOOK_SEND_ERROR_REPORT.content,
                blocks$: [...WEBHOOK_BLOCKS_ERROR_REPORT],
                // Pins buildMessageRows' `stereo === 'system'` branch: a webhook chat is a
                // user bubble, not a system notice.
                stereo: WEBHOOK_SEND_ERROR_REPORT.stereo,
            } as Partial<DomainChat>),
        ];

        render(<ThreadPanel channel={CHANNEL} rootId="C1:1" members={[]} />, { wrapper });

        expect(screen.getByRole('heading', { name: /error-report/ })).toBeTruthy();
    });

    // The read counts are mounted once by the host and handed to both surfaces. The panel
    // shares the feed's renderer, so forgetting to pass them on would leave replies silently
    // without a receipt — the shape of the three twin bugs in CLAUDE.md.
    it('passes the read counts through to the replies', () => {
        messages = [chat(1, { content: 'root' }), chat(2, { content: 'reply', parentId: 'C1:1' })];

        render(
            <ThreadPanel
                channel={CHANNEL}
                rootId="C1:1"
                members={[]}
                readCountOf={() => ({ readCount: 2, unreadCount: 1 })}
            />,
            { wrapper }
        );

        expect(screen.getAllByText('Seen by 2').length).toBeGreaterThan(0);
    });

    // Addressed to the channel's own cloud, captured at the press, so a cloud switch while the
    // reply is in flight cannot send it through the next cloud's socket.
    it("sends a reply, with its pictures, to the thread in the channel's own cloud and empties the tray", () => {
        messages = [chat(1, { content: 'root' })];
        const files = [new File(['a'], 'a.png', { type: 'image/png' })];

        render(<ThreadPanel channel={{ ...CHANNEL, cid: 'cloud-a' } as DomainChannel} rootId="C1:1" members={[]} />, {
            wrapper,
        });
        composerOnSend?.('reply', files);

        expect(useComposerSend).toHaveBeenLastCalledWith({ cid: 'cloud-a', channelId: 'C1', parentId: 'C1:1' });
        expect(composerSend).toHaveBeenCalledWith('reply', files);
        expect(clearTray).toHaveBeenCalled();
    });

    it('binds no room for pictures until the root has loaded, so it is not taken for the chat pane', () => {
        messages = [];
        getChat.mockReturnValue(new Promise(() => undefined));

        render(<ThreadPanel channel={{ ...CHANNEL, cid: 'cloud-a' } as DomainChannel} rootId="C1:1" members={[]} />, {
            wrapper,
        });

        expect(useComposerSend).toHaveBeenLastCalledWith({ cid: 'cloud-a', channelId: '' });
    });

    it('counts only real replies, not the reaction events', () => {
        messages = THREAD_WITH_REACTION;

        render(<ThreadPanel channel={CHANNEL} rootId="C1:1" members={[]} />, { wrapper });

        expect(screen.getByText('1 reply')).toBeTruthy();
    });
});
