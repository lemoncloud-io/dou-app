import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, render } from '@testing-library/react';

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

import '../../../../i18n';

import { MessageList } from './MessageList';

Element.prototype.scrollIntoView = vi.fn();

const VIEWER = { uid: 'me', name: 'Me', cloudUid: 'me-cloud' };
const NAMES = new Map([
    ['ada', 'Ada'],
    ['bo', 'Bo'],
]);

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const DAY_MS = 24 * 60 * 60 * 1000;
// Anchored on today, so the newest day is today and no closing divider joins the three under test.
const NOON = new Date().setHours(12, 0, 0, 0);

// Authors alternate, so every message is its own row.
const message = (chatNo: number, daysAgo: number): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        ownerId: chatNo % 2 ? 'ada' : 'bo',
        content: `message ${chatNo}`,
        createdAt: NOON - daysAgo * DAY_MS + chatNo * 1000,
    }) as DomainChat;

describe('MessageList date dividers', () => {
    afterEach(cleanup);

    // A sticky pill is bounded by its parent, so two pills sharing the feed as a parent never hand over:
    // the earlier one stays pinned under the later one. Each pill must share a parent with its own day only.
    it('keeps each day pill in a block that holds only that day, so a later pill replaces it', () => {
        const feed = [message(1, 2), message(2, 2), message(3, 1), message(4, 1), message(5, 0)];
        const { container } = render(<MessageList messages={feed} isLoading={false} viewer={VIEWER} names={NAMES} />, {
            wrapper,
        });

        const pills = Array.from(container.querySelectorAll<HTMLElement>('[data-row-key^="date:"]'));
        expect(pills).toHaveLength(3);

        const blocks = pills.map(pill => pill.parentElement as HTMLElement);
        expect(new Set(blocks).size).toBe(3);

        const chatNosIn = (block: HTMLElement) =>
            Array.from(block.querySelectorAll<HTMLElement>('[data-chat-no]')).map(el => el.dataset.chatNo);
        expect(blocks.map(chatNosIn)).toEqual([['1', '2'], ['3', '4'], ['5']]);
    });
});
