import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

// One object for every call: a fresh one per render would change what the rows derive from it, and
// every row would redraw for a reason that has nothing to do with read markers.
const session = vi.hoisted(() => ({ activeServer: { siteId: 'S1' } }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn() },
            }),
        },
        session: {
            getActiveServerContext: () => ({ siteId: 'S1' }),
            useGlobalSession: () => session,
        },
    },
}));

import i18n from '../../../../i18n';

import type { MemberReadCursor, ReadCount } from '../../../shared';
import { MessageList } from './MessageList';

Element.prototype.scrollIntoView = vi.fn();

const VIEWER = { uid: 'me', name: 'Me' };

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const message = (chatNo: number, ownerId: string, extra: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        ownerId,
        content: `message ${chatNo}`,
        createdAt: 1_700_000_000_000 + chatNo * 1000,
        ...extra,
    }) as DomainChat;

const at = (userId: string, cursor: number): MemberReadCursor => ({ userId, cursor });

// Members the roster below can name: m0 is Sunny, m1 is `레인`, bob is Bob (from the feed names).
const everyoneRead = (): ReadCount => ({ readIds: ['m0', 'm1', 'bob'], unreadIds: [] });

const renderList = (
    messages: DomainChat[],
    readCursors?: MemberReadCursor[],
    readCountOf: (chatNo: number, authorId: string) => ReadCount | null = everyoneRead
) =>
    render(
        <MessageList
            messages={messages}
            isLoading={false}
            viewer={VIEWER}
            names={
                new Map([
                    ['ada', 'Ada'],
                    ['bob', 'Bob'],
                ])
            }
            mentionables={[
                { id: 'm0', name: 'Sunny', thumbnail: 'https://cdn.example/sunny.png' },
                { id: 'm1', name: '레인' },
                { id: 'everyone', name: 'everyone', everyone: true },
            ]}
            readCountOf={readCountOf}
            readCursors={readCursors}
        />,
        { wrapper }
    );

afterEach(() => {
    cleanup();
    void i18n.changeLanguage('en');
});

const rowOf = (text: string): HTMLElement => {
    const row = screen.getByText(text).closest<HTMLElement>('[data-chat-no]');
    if (!row) throw new Error(`no row holds "${text}"`);
    return row;
};
const markerIn = (text: string) => within(rowOf(text)).queryByRole('button', { name: /Seen/ });

describe('MessageList read markers', () => {
    it('puts each member’s face on the message they last read', () => {
        renderList([message(1, 'ada'), message(2, 'ada'), message(3, 'ada')], [at('m0', 2), at('m1', 1)]);

        expect(within(markerIn('message 2') as HTMLElement).getByText('S')).toBeDefined();
        expect(within(markerIn('message 1') as HTMLElement).getByText('레')).toBeDefined();
        expect(markerIn('message 3')).toBeNull();
    });

    it('gathers members who stopped at the same message into one marker', () => {
        renderList([message(1, 'ada'), message(2, 'ada')], [at('m0', 2), at('m1', 2)]);

        expect(screen.getAllByRole('button', { name: /Seen/ })).toHaveLength(1);
        const marker = markerIn('message 2') as HTMLElement;
        expect(within(marker).getByText('S')).toBeDefined();
        expect(within(marker).getByText('레')).toBeDefined();
    });

    it('shows three faces and counts the rest when more members stopped at one message', () => {
        const cursors = ['m0', 'm1', 'bob', 'm3', 'm4'].map(id => at(id, 1));
        renderList([message(1, 'ada')], cursors);

        expect(within(markerIn('message 1') as HTMLElement).getByText('+2')).toBeDefined();
    });

    it('draws no “Seen N · Not seen M” text under an author block any more', () => {
        renderList([message(1, 'ada'), message(2, 'ada')], [at('m0', 2)]);

        expect(screen.queryByText(/Seen/)).toBeNull();
        expect(screen.queryByText(/Not seen/)).toBeNull();
    });

    it('lowers a cursor that sits on a number no row carries to the message below it', () => {
        // Number 2 went to a reaction or a system event, so only 1 and 3 have rows.
        renderList([message(1, 'ada'), message(3, 'ada')], [at('m0', 2)]);

        expect(markerIn('message 1')).not.toBeNull();
        expect(markerIn('message 3')).toBeNull();
    });

    it('leaves a message’s author off their own message, as the list does', () => {
        // m0 wrote message 1 and has read to it; m1 stopped there too. Only m1 is a reader of it.
        renderList([message(1, 'm0')], [at('m0', 1), at('m1', 1)]);

        const marker = markerIn('message 1') as HTMLElement;
        expect(within(marker).getByText('레')).toBeDefined();
        expect(within(marker).queryByText('S')).toBeNull();
    });

    it('draws no marker when the only member at a message is its author', () => {
        renderList([message(1, 'm0')], [at('m0', 1)]);

        expect(screen.queryByRole('button', { name: /Seen/ })).toBeNull();
    });

    it('puts no face on a message from before the member joined, where the list would not name them', () => {
        // The member's cursor is past message 2, but they joined after it: the list for that message
        // never includes them, so a face there would open a list without the person it shows.
        renderList([message(1, 'ada'), message(2, 'ada')], [{ userId: 'm0', cursor: 9, joinedNo: 5 }]);

        expect(screen.queryByRole('button', { name: /Seen/ })).toBeNull();
    });

    it('leaves out a member whose cursor is below every loaded message', () => {
        renderList([message(5, 'ada'), message(6, 'ada')], [at('m0', 2), at('m1', 6)]);

        expect(screen.getAllByRole('button', { name: /Seen/ })).toHaveLength(1);
        expect(within(markerIn('message 6') as HTMLElement).getByText('레')).toBeDefined();
    });

    it('moves a marker past a message still being sent, failed or deleted to the last settled one', () => {
        renderList(
            [
                message(1, 'ada'),
                message(2, 'ada', { hidden: true } as Partial<DomainChat>),
                message(3, 'ada', { isFailed: true }),
                message(4, 'me', { isPending: true, chatNo: Number.MAX_SAFE_INTEGER }),
            ],
            [at('m0', 9)]
        );

        expect(screen.getAllByRole('button', { name: /Seen/ })).toHaveLength(1);
        expect(markerIn('message 1')).not.toBeNull();
    });

    it('draws no marker where the room has no count to give', () => {
        renderList([message(1, 'ada')], [at('m0', 1)], () => null);

        expect(screen.queryByRole('button', { name: /Seen/ })).toBeNull();
    });

    it('draws no marker where no cursors are wired, as in a room that shows none', () => {
        renderList([message(1, 'ada')]);

        expect(screen.queryByRole('button', { name: /Seen/ })).toBeNull();
    });

    it('draws no marker when nobody has cursors yet', () => {
        renderList([message(1, 'ada')], []);

        expect(screen.queryByRole('button', { name: /Seen/ })).toBeNull();
    });

    it('asks for the count of the message a marker sits on, with that message’s author', () => {
        const readCountOf = vi.fn(everyoneRead);
        renderList([message(1, 'ada'), message(2, 'bob')], [at('m0', 1), at('m1', 2)], readCountOf);

        expect(readCountOf.mock.calls).toEqual([
            [1, 'ada'],
            [2, 'bob'],
        ]);
    });

    it('does not ask for the count of a message nobody stopped at', () => {
        const readCountOf = vi.fn(everyoneRead);
        renderList([message(1, 'ada'), message(2, 'ada'), message(3, 'ada')], [at('m0', 2)], readCountOf);

        expect(readCountOf.mock.calls).toEqual([[2, 'ada']]);
    });

    it('opens the full list of who read that message when a marker is clicked', async () => {
        renderList([message(1, 'ada'), message(2, 'ada')], [at('m0', 2)], chatNo =>
            chatNo === 2 ? { readIds: ['m0'], unreadIds: ['m1'] } : null
        );
        await act(async () => fireEvent.click(markerIn('message 2') as HTMLElement));

        const popover = screen.getByRole('dialog');
        expect(within(popover).getByRole('tab', { name: 'Seen 1', selected: true })).toBeDefined();
        expect(within(popover).getByRole('tab', { name: 'Not seen 1' })).toBeDefined();
        expect(within(popover).getByText('Sunny')).toBeDefined();
    });

    it('names a member missing from the roster by the feed names, then by a placeholder, rather than dropping them', async () => {
        renderList([message(1, 'ada')], [at('m0', 1)], () => ({ readIds: ['m0', 'bob', 'ghost'], unreadIds: [] }));
        await act(async () => fireEvent.click(markerIn('message 1') as HTMLElement));

        const list = within(screen.getByRole('dialog')).getAllByRole('listitem');
        expect(list.map(item => item.textContent)).toEqual(['SSunny', 'BBob', '--']);
    });

    it('keeps an open list open when a join update brings the same positions again', async () => {
        const messages = [message(1, 'ada'), message(2, 'bob')];
        const names = new Map([
            ['ada', 'Ada'],
            ['bob', 'Bob'],
        ]);
        const mentionables = [{ id: 'm0', name: 'Sunny' }];
        const list = (cursors: MemberReadCursor[]) => (
            <MessageList
                messages={messages}
                isLoading={false}
                viewer={VIEWER}
                names={names}
                mentionables={mentionables}
                readCountOf={everyoneRead}
                readCursors={cursors}
            />
        );
        const { rerender } = render(list([at('m0', 2)]), { wrapper });
        await act(async () => fireEvent.click(markerIn('message 2') as HTMLElement));
        expect(screen.getByRole('dialog')).toBeDefined();

        // A fresh array of fresh objects holding the same positions, as every join update produces.
        rerender(list([at('m0', 2)]));

        expect(screen.getByRole('dialog')).toBeDefined();
    });

    it('moves a face from one message to the next when that member reads on', () => {
        const messages = [message(1, 'ada'), message(2, 'ada')];
        const { rerender } = renderList(messages, [at('m0', 1)]);
        expect(markerIn('message 1')).not.toBeNull();

        rerender(
            <MessageList
                messages={messages}
                isLoading={false}
                viewer={VIEWER}
                mentionables={[{ id: 'm0', name: 'Sunny' }]}
                readCountOf={everyoneRead}
                readCursors={[at('m0', 2)]}
            />
        );

        expect(markerIn('message 1')).toBeNull();
        expect(markerIn('message 2')).not.toBeNull();
    });
});
