import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, render, screen } from '@testing-library/react';

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

const renderList = (messages: DomainChat[], readCountOf?: (chatNo: number) => ReadCount | null) =>
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
            return { read: 5, unread: 7 };
        });

        expect(screen.getAllByText('Seen 5 · Not seen 7')).toHaveLength(1);
        expect(asked).toEqual([2]);
    });

    it('gives each author block its own count', () => {
        renderList([message(1, 'ada'), message(2, 'bob')], chatNo =>
            chatNo === 1 ? { read: 3, unread: 1 } : { read: 1, unread: 3 }
        );

        expect(screen.getByText('Seen 3 · Not seen 1')).toBeDefined();
        expect(screen.getByText('Seen 1 · Not seen 3')).toBeDefined();
    });

    it('drops the not-seen half once everyone has read it', () => {
        renderList([message(1, 'ada')], () => ({ read: 4, unread: 0 }));

        expect(screen.getByText('Seen 4')).toBeDefined();
        expect(screen.queryByText(/Not seen/)).toBeNull();
    });

    it('reads the count in Korean as the design does', async () => {
        await i18n.changeLanguage('ko');
        renderList([message(1, 'ada')], () => ({ read: 5, unread: 7 }));

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
        const readCountOf = vi.fn(() => ({ read: 1, unread: 1 }));
        renderList([message(1, 'me', { isPending: true, chatNo: Number.MAX_SAFE_INTEGER })], readCountOf);

        expect(screen.queryByText(/Seen/)).toBeNull();
    });

    it('keeps the count under the last settled message while a newer one in the block is being sent', () => {
        renderList(
            [message(1, 'me'), message(2, 'me', { isPending: true, chatNo: Number.MAX_SAFE_INTEGER })],
            chatNo => (chatNo === 1 ? { read: 2, unread: 1 } : null)
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
            chatNo => (chatNo === 1 ? { read: 3, unread: 0 } : null)
        );

        expect(screen.getByText('Seen 3')).toBeDefined();
    });

    it('shows nothing under a deleted message', () => {
        renderList([message(1, 'ada', { hidden: true } as Partial<DomainChat>)], () => ({ read: 2, unread: 0 }));

        expect(screen.queryByText(/Seen/)).toBeNull();
    });
});
