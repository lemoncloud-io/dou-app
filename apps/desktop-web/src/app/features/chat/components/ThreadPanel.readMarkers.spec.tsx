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
    byChatNo: new Map<number, ReadCount>(),
    channelsAsked: [] as unknown[],
}));
vi.mock('../../../shared/hooks/useChannelReadCounts', () => ({
    useChannelReadCounts: (channel: unknown) => {
        readCounts.channelsAsked.push(channel);
        return {
            readCountOf: (chatNo: number): ReadCount | null => readCounts.byChatNo.get(chatNo) ?? null,
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
const pillIn = (text: string) => within(rowOf(text)).queryByRole('button', { name: /Seen/ });

describe('ThreadPanel read pills', () => {
    beforeEach(() => {
        messages = THREAD;
        readCounts.cursors = [];
        readCounts.byChatNo = new Map();
        readCounts.channelsAsked.length = 0;
    });

    it('gives each author’s message its own pill with its counts written out', () => {
        readCounts.byChatNo = new Map([
            [10, { readIds: ['m0', 'm1'], unreadIds: ['m2'] }],
            [11, { readIds: ['m0'], unreadIds: ['m1', 'm2'] }],
            [12, { readIds: ['m0', 'm1', 'm2'], unreadIds: [] }],
        ]);
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(pillIn('root')?.textContent).toContain('Seen 2 · Not seen 1');
        expect(pillIn('first reply')?.textContent).toContain('Seen 1 · Not seen 2');
        expect(pillIn('second reply')?.textContent).toContain('Seen 3');
    });

    it('draws the pill whether or not anyone stopped reading at that message', () => {
        // Everyone has read past the whole thread: a position marker would sit on the last reply only.
        readCounts.cursors = [at('m0', 90), at('m1', 90)];
        readCounts.byChatNo = new Map([
            [10, { readIds: ['m0', 'm1'], unreadIds: [] }],
            [11, { readIds: ['m0', 'm1'], unreadIds: [] }],
            [12, { readIds: ['m0', 'm1'], unreadIds: [] }],
        ]);
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(pillIn('root')).not.toBeNull();
        expect(pillIn('first reply')).not.toBeNull();
        expect(pillIn('second reply')).not.toBeNull();
    });

    it('gives replies sent back to back by one author a single pill, on the last of them', () => {
        messages = [...THREAD, chat(13, { content: 'third reply', ownerId: 'ada', parentId: 'C1:10' })];
        readCounts.byChatNo = new Map([
            [12, { readIds: ['m0'], unreadIds: ['m1'] }],
            [13, { readIds: ['m0'], unreadIds: ['m1'] }],
        ]);
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(screen.getAllByText(/^Seen 1/)).toHaveLength(1);
        expect(pillIn('third reply')).not.toBeNull();
    });

    it('leaves a message the room has no count for without a pill', () => {
        readCounts.byChatNo = new Map([[10, { readIds: ['m0'], unreadIds: [] }]]);
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(pillIn('root')).not.toBeNull();
        expect(pillIn('first reply')).toBeNull();
        expect(pillIn('second reply')).toBeNull();
    });

    it('asks for the read counts of the channel the thread belongs to', () => {
        render(<ThreadPanel channel={CHANNEL} rootId="10" members={[]} />, { wrapper });

        expect(readCounts.channelsAsked).toContain(CHANNEL);
    });
});
