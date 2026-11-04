import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, within } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type { useThreadRoot as UseThreadRoot } from '../hooks/useThreadRoot';
import type { MemberReadCursor, ReadCount } from '../../../shared';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn(), getChat: vi.fn() },
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
vi.mock('../../../shared/hooks/useChats', () => ({
    useChats: () => ({ messages, isLoading: false, loadOlder: vi.fn(), hasMore: false, isLoadingOlder: false }),
}));
vi.mock('../../../shared/hooks/useAuthorNames', () => ({ useAuthorNames: () => new Map() }));
vi.mock('../../../shared/hooks/usePanelWidth', () => ({
    usePanelWidth: () => ({ width: 384, minWidth: 280, maxWidth: 640, panelRef: { current: null } }),
}));
vi.mock('../hooks', async () => ({
    useThreadRoot: (await vi.importActual<{ useThreadRoot: typeof UseThreadRoot }>('../hooks/useThreadRoot'))
        .useThreadRoot,
    useMentionables: () => [],
    useMessageViewer: () => ({ uid: 'me', name: 'Me', cloudUid: 'me-cloud' }),
    useMessageActions: () => ({ editMessage: vi.fn(), deleteMessage: vi.fn(), failedId: null }),
    useReactions: () => ({ toggleReaction: vi.fn(), failedId: null }),
    useImageAttachments: () => ({ attachments: [], addFiles: vi.fn(), remove: vi.fn(), clear: vi.fn() }),
    useFileDrop: () => ({ isDragging: false, dropHandlers: {} }),
    useChatImages: () => [],
    useComposerSend: () => ({ send: vi.fn() }),
}));
vi.mock('./Composer', () => ({ Composer: () => null }));

// What the room's read counts say, set per test; the panel is only asked to hand it on.
const readCounts = vi.hoisted(() => ({
    cursors: [] as { userId: string; cursor: number }[],
    channelsAsked: [] as unknown[],
}));
vi.mock('../../../shared/hooks/useChannelReadCounts', () => ({
    useChannelReadCounts: (channel: unknown) => {
        readCounts.channelsAsked.push(channel);
        return {
            readCountOf: (): ReadCount => ({ readIds: ['ada'], unreadIds: ['bob'] }),
            cursors: readCounts.cursors,
        };
    },
}));

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

const at = (userId: string, cursor: number): MemberReadCursor => ({ userId, cursor });

// A root and two replies. Replies by different authors, so each message is a row of its own.
const THREAD: DomainChat[] = [
    chat(10, { content: 'root' }),
    chat(11, { content: 'first reply', ownerId: 'bob', parentId: 'C1:10' }),
    chat(12, { content: 'second reply', ownerId: 'ada', parentId: 'C1:10' }),
];

const rowOf = (text: string): HTMLElement => {
    const row = screen.getByText(text).closest<HTMLElement>('[data-chat-no]');
    if (!row) throw new Error(`no row holds "${text}"`);
    return row;
};
const markerIn = (text: string) => within(rowOf(text)).queryByRole('button', { name: /Seen/ });

describe('ThreadPanel read markers', () => {
    beforeEach(() => {
        messages = THREAD;
        readCounts.cursors = [];
        readCounts.channelsAsked.length = 0;
    });

    it('puts a member’s face on the root or the reply they last read', () => {
        readCounts.cursors = [at('m0', 10), at('m1', 11)];
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(markerIn('root')).not.toBeNull();
        expect(markerIn('first reply')).not.toBeNull();
        expect(markerIn('second reply')).toBeNull();
    });

    it('puts a member who has read past the last reply on the last reply', () => {
        readCounts.cursors = [at('m0', 90)];
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(markerIn('second reply')).not.toBeNull();
        expect(markerIn('root')).toBeNull();
    });

    it('leaves out a member who has not reached the root', () => {
        readCounts.cursors = [at('m0', 4)];
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(screen.queryByRole('button', { name: /Seen/ })).toBeNull();
    });

    it('draws no marker when the room has no cursors to give', () => {
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(screen.queryByRole('button', { name: /Seen/ })).toBeNull();
    });

    it('asks for the read counts of the channel the thread belongs to', () => {
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(readCounts.channelsAsked).toContain(CHANNEL);
    });
});
