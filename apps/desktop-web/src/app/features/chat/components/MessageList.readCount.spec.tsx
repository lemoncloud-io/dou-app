import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn() },
            }),
        },
        session: {
            getActiveServerContext: () => ({ siteId: 'S1' }),
            useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
        },
    },
}));

import i18n from '../../../../i18n';

import type { ReadCount } from '../../../shared';
import { MessageList } from './MessageList';

Element.prototype.scrollIntoView = vi.fn();

const VIEWER = { uid: 'me', name: 'Me' };

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

// Same author, a second apart: one block of two messages.
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

// `read` members who have read and `unread` who have not, named m0, m1, … in roster order.
const counts = (read: number, unread: number): ReadCount => {
    const ids = Array.from({ length: read + unread }, (_, i) => `m${i}`);
    return { readIds: ids.slice(0, read), unreadIds: ids.slice(read) };
};

const renderList = (messages: DomainChat[], readCountOf?: (chatNo: number, authorId: string) => ReadCount | null) =>
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
        />,
        { wrapper }
    );

afterEach(() => {
    cleanup();
    void i18n.changeLanguage('en');
});

describe('MessageList read counts', () => {
    it('shows one count per author block, for its last message', () => {
        const asked: number[] = [];
        renderList([message(1, 'ada'), message(2, 'ada')], chatNo => {
            asked.push(chatNo);
            return counts(5, 7);
        });

        expect(screen.getAllByText('Seen 5 · Not seen 7')).toHaveLength(1);
        expect(asked).toEqual([2]);
    });

    it('asks for the count with the block author, so they are left out of their own message', () => {
        const readCountOf = vi.fn((_chatNo: number, _authorId: string) => counts(1, 1));
        renderList([message(1, 'ada'), message(2, 'bob')], readCountOf);

        expect(readCountOf.mock.calls).toEqual([
            [1, 'ada'],
            [2, 'bob'],
        ]);
    });

    it('gives each author block its own count', () => {
        renderList([message(1, 'ada'), message(2, 'bob')], chatNo => (chatNo === 1 ? counts(3, 1) : counts(1, 3)));

        expect(screen.getByText('Seen 3 · Not seen 1')).toBeDefined();
        expect(screen.getByText('Seen 1 · Not seen 3')).toBeDefined();
    });

    it('drops the not-seen half once everyone has read it', () => {
        renderList([message(1, 'ada')], () => counts(4, 0));

        expect(screen.getByText('Seen 4')).toBeDefined();
        expect(screen.queryByText(/Not seen/)).toBeNull();
    });

    it('reads the count in Korean as the design does', async () => {
        await i18n.changeLanguage('ko');
        renderList([message(1, 'ada')], () => counts(5, 7));

        expect(screen.getByText('읽음 5 · 미확인 7')).toBeDefined();
    });

    it('shows nothing while the room has no count to give', () => {
        renderList([message(1, 'ada')], () => null);

        expect(screen.queryByText(/Seen/)).toBeNull();
    });

    it('shows nothing where no count is wired, as in the thread panel', () => {
        renderList([message(1, 'ada')]);

        expect(screen.queryByText(/Seen/)).toBeNull();
    });

    it('shows nothing under a message still being sent', () => {
        const readCountOf = vi.fn(() => counts(1, 1));
        renderList([message(1, 'me', { isPending: true, chatNo: Number.MAX_SAFE_INTEGER })], readCountOf);

        expect(screen.queryByText(/Seen/)).toBeNull();
    });

    it('keeps the count under the last settled message while a newer one in the block is being sent', () => {
        renderList(
            [message(1, 'me'), message(2, 'me', { isPending: true, chatNo: Number.MAX_SAFE_INTEGER })],
            chatNo => (chatNo === 1 ? counts(2, 1) : null)
        );

        expect(screen.getByText('Seen 2 · Not seen 1')).toBeDefined();
        const settled = screen.getByText('message 1').closest('[data-chat-no]');
        expect(settled?.textContent).toContain('Seen 2 · Not seen 1');
    });

    it('keeps the count under the last settled message when the newest one failed or was deleted', () => {
        renderList(
            [
                message(1, 'ada'),
                message(2, 'ada', { hidden: true } as Partial<DomainChat>),
                message(3, 'ada', { isFailed: true }),
            ],
            chatNo => (chatNo === 1 ? counts(3, 0) : null)
        );

        expect(screen.getByText('Seen 3')).toBeDefined();
    });

    it('shows nothing under a deleted message', () => {
        renderList([message(1, 'ada', { hidden: true } as Partial<DomainChat>)], () => counts(2, 0));

        expect(screen.queryByText(/Seen/)).toBeNull();
    });

    describe('who read it', () => {
        const pill = () => screen.getByRole('button', { name: /Seen/ });

        it('lists who read it and who has not, a tab each, when the pointer rests on the count', async () => {
            renderList([message(1, 'ada')], () => counts(2, 1));
            await act(async () => fireEvent.pointerEnter(pill()));

            const popover = screen.getByRole('dialog');
            expect(within(popover).getByRole('tab', { name: 'Seen 2', selected: true })).toBeDefined();
            expect(within(popover).getByRole('tab', { name: 'Not seen 1' })).toBeDefined();
            expect(within(popover).getByText('Sunny')).toBeDefined();
            expect(within(popover).getByText('레인')).toBeDefined();
        });

        it('names a member missing from the roster by the feed names, then by a placeholder, rather than dropping them', async () => {
            renderList([message(1, 'ada')], () => ({ readIds: ['m0', 'bob', 'ghost'], unreadIds: [] }));
            await act(async () => fireEvent.pointerEnter(pill()));

            const list = within(screen.getByRole('dialog')).getAllByRole('listitem');
            expect(list.map(item => item.textContent)).toEqual(['SSunny', 'BBob', '--']);
        });

        it('opens from the keyboard with focus inside, so the not-seen list can be reached', async () => {
            renderList([message(1, 'ada')], () => counts(1, 1));
            await act(async () => fireEvent.click(pill(), { detail: 0 }));

            const popover = screen.getByRole('dialog');
            expect(popover.contains(document.activeElement)).toBe(true);
            await act(async () => within(popover).getByRole('tab', { name: 'Not seen 1' }).focus());

            expect(within(popover).getByRole('tab', { name: 'Not seen 1', selected: true })).toBeDefined();
            expect(within(popover).getByRole('tabpanel').textContent).toContain('레인');
            expect(within(popover).getByRole('tabpanel').textContent).not.toContain('Sunny');
        });

        it('hands focus back to the count when Escape closes a keyboard-opened list', async () => {
            renderList([message(1, 'ada')], () => counts(1, 1));
            await act(async () => fireEvent.click(pill(), { detail: 0 }));
            await act(async () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }));

            expect(screen.queryByRole('dialog')).toBeNull();
            // Radix restores focus on the tick after the card unmounts.
            await waitFor(() => expect(document.activeElement).toBe(pill()));
        });

        it('leaves focus where the reader moved it when they leave a keyboard-opened list', async () => {
            renderList([message(1, 'ada')], () => counts(1, 1));
            const elsewhere = document.body.appendChild(document.createElement('button'));
            try {
                await act(async () => fireEvent.click(pill(), { detail: 0 }));
                await act(async () => elsewhere.focus());
                await act(async () => new Promise(resolve => setTimeout(resolve, 0)));

                expect(screen.queryByRole('dialog')).toBeNull();
                expect(document.activeElement).toBe(elsewhere);
            } finally {
                elsewhere.remove();
            }
        });

        it('keeps a keyboard-opened list open when the pointer passes over the count', async () => {
            vi.useFakeTimers();
            try {
                renderList([message(1, 'ada')], () => counts(1, 1));
                await act(async () => fireEvent.click(pill(), { detail: 0 }));
                await act(async () => {
                    fireEvent.pointerEnter(pill());
                    fireEvent.pointerLeave(pill());
                    vi.runAllTimers();
                });

                expect(screen.getByRole('dialog')).toBeDefined();
            } finally {
                vi.useRealTimers();
            }
        });

        it('keeps focus where it was when the pointer opens it', async () => {
            renderList([message(1, 'ada')], () => counts(1, 1));
            const before = document.activeElement;
            await act(async () => fireEvent.pointerEnter(pill()));

            expect(screen.getByRole('dialog')).toBeDefined();
            expect(document.activeElement).toBe(before);
        });

        it('closes once the pointer leaves', async () => {
            vi.useFakeTimers();
            try {
                renderList([message(1, 'ada')], () => counts(1, 1));
                await act(async () => fireEvent.pointerEnter(pill()));
                await act(async () => {
                    fireEvent.pointerLeave(pill());
                    vi.runAllTimers();
                });

                expect(screen.queryByRole('dialog')).toBeNull();
            } finally {
                vi.useRealTimers();
            }
        });

        it('stacks the faces of the first three who read it and counts the rest', () => {
            renderList([message(1, 'ada')], () => counts(5, 0));

            expect(within(pill()).getByText('+2')).toBeDefined();
            expect(within(pill()).getByText('S')).toBeDefined();
            expect(within(pill()).getByText('레')).toBeDefined();
        });
    });
});
