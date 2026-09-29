import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn() },
            }),
        },
        session: {
            getActiveServerContext: () => ({ kind: 'cloud', siteId: 'S1' }),
            useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
        },
    },
}));

let messages: DomainChat[] = [];
vi.mock('../../../shared/hooks/useChats', () => ({ useChats: () => ({ messages }) }));
const composerSend = vi.fn();
const useComposerSend = vi.fn((_target: unknown) => ({ send: composerSend }));
const clearTray = vi.fn();
vi.mock('../../../shared/hooks/useAuthorNames', () => ({ useAuthorNames: () => new Map() }));
vi.mock('../../../shared/hooks/usePanelWidth', () => ({
    usePanelWidth: () => ({ width: 384, minWidth: 280, maxWidth: 640, panelRef: { current: null } }),
}));
vi.mock('../hooks', () => ({
    useMentionables: () => [],
    useMessageViewer: () => ({ uid: 'me', name: 'Me', cloudUid: 'me-cloud' }),
    useMessageActions: () => ({ editMessage: vi.fn(), deleteMessage: vi.fn(), failedId: null }),
    useReactions: () => ({ toggleReaction: vi.fn(), failedId: null }),
    useImageAttachments: () => ({
        attachments: [],
        addFiles: vi.fn(),
        remove: vi.fn(),
        clear: clearTray,
        notice: null,
        dismissNotice: vi.fn(),
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
    it('shows the reactions on a threaded message', () => {
        // The server keeps no reaction state: the tallies are folded out of the loaded feed. The
        // panel renders the same messages as the feed, so a message with reactions has to carry
        // them here too (.claude/20260804/DEBUG-15-17-00.md).
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

        expect(screen.getAllByText('Read 2').length).toBeGreaterThan(0);
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
