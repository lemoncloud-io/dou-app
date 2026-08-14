import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => ({ chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn() } }),
}));
vi.mock('@chatic/web-core', () => ({
    getActiveServerContext: () => ({ kind: 'cloud', siteId: 'S1' }),
    useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
}));

let messages: DomainChat[] = [];
vi.mock('../../../shared/hooks/useChats', () => ({ useChats: () => ({ messages }) }));
vi.mock('../../../shared/hooks/useChatMutations', () => ({
    useChatMutations: () => ({ sendMessage: vi.fn(), retryMessage: vi.fn(), discardMessage: vi.fn() }),
}));
vi.mock('../../../shared/hooks/useAuthorNames', () => ({ useAuthorNames: () => new Map() }));
vi.mock('../../../shared/hooks/usePanelWidth', () => ({
    usePanelWidth: () => ({ width: 384, minWidth: 280, maxWidth: 640, panelRef: { current: null } }),
}));
vi.mock('../hooks', () => ({
    useMentionables: () => [],
    useMessageViewer: () => ({ uid: 'me', name: 'Me', cloudUid: 'me-cloud' }),
    useMessageActions: () => ({ editMessage: vi.fn(), deleteMessage: vi.fn(), failedId: null }),
    useReactions: () => ({ toggleReaction: vi.fn(), failedId: null }),
}));
// The composer is a rich-text editor with its own runtime needs; this file is about
// what the panel renders above it.
vi.mock('./Composer', () => ({ Composer: () => null }));

import '../../../../i18n';

import { ThreadPanel } from './ThreadPanel';

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
        // "<emoji> — <reactors>", and only the chip means the reaction is on the message.
        expect(screen.getByLabelText(/^👍 —/)).toBeTruthy();
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

    it('counts only real replies, not the reaction events', () => {
        messages = THREAD_WITH_REACTION;

        render(<ThreadPanel channel={CHANNEL} rootId="C1:1" members={[]} />, { wrapper });

        expect(screen.getByText('1 reply')).toBeTruthy();
    });
});
