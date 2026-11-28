import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, render } from '@testing-library/react';

import type { DomainChat } from '@chatic/runtime-react';
import { TooltipProvider } from '@chatic/ui-kit';

import type * as DesignSystemModule from '@chatic/design-system-components-desktop';

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn() },
            }),
        },
        session: {
            getActiveServerContext: () => ({ siteId: 'S1' }),
            useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
        },
    })
);

const rowRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@chatic/design-system-components-desktop', async importOriginal => {
    const actual = await importOriginal<typeof DesignSystemModule>();
    return {
        ...actual,
        useMediaQuery: (query: string) => {
            if (query === '(hover: hover)') rowRenders.count += 1;
            return actual.useMediaQuery(query);
        },
    };
});

import '../../../../i18n';

import { MessageList } from './MessageList';

Element.prototype.scrollIntoView = vi.fn();

const VIEWER = { uid: 'me', name: 'Me', cloudUid: 'me-cloud' };
const NAMES = new Map([
    ['ada', 'Ada'],
    ['bo', 'Bo'],
]);

const client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const message = (chatNo: number): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        ownerId: chatNo % 2 ? 'ada' : 'bo',
        content: `message ${chatNo}`,
        createdAt: 1_700_000_000_000 + chatNo * 1000,
    }) as DomainChat;

const FEED = Array.from({ length: 200 }, (_, i) => message(i + 1));
const NEXT = message(201);

describe('MessageList row re-renders', { timeout: 30_000 }, () => {
    beforeEach(() => {
        rowRenders.count = 0;
    });
    afterEach(cleanup);

    const renderFeed = (messages: DomainChat[], jumpTarget?: { chatNo: number; nonce: number }) =>
        render(
            <MessageList messages={messages} isLoading={false} viewer={VIEWER} names={NAMES} jumpTarget={jumpTarget} />,
            { wrapper }
        );

    it('renders only the new block when a message arrives', () => {
        const { rerender } = renderFeed(FEED);
        expect(rowRenders.count).toBe(FEED.length);

        rowRenders.count = 0;
        rerender(<MessageList messages={[...FEED, NEXT]} isLoading={false} viewer={VIEWER} names={NAMES} />);
        expect(rowRenders.count).toBe(1);
    });

    it('renders only the target block when a jump flashes it, and again when the flash clears', async () => {
        const { rerender, container } = renderFeed(FEED);

        rowRenders.count = 0;
        rerender(
            <MessageList
                messages={FEED}
                isLoading={false}
                viewer={VIEWER}
                names={NAMES}
                jumpTarget={{ chatNo: 100, nonce: 1 }}
            />
        );
        expect(rowRenders.count).toBe(1);
        const target = () => container.querySelector('[data-chat-no="100"]')?.outerHTML;
        expect(target()).toMatch(/bg-primary\/10/);

        await act(() => new Promise(resolve => setTimeout(resolve, 2000)));
        expect(target()).toMatch(/bg-primary\/10/);
        rowRenders.count = 0;
        await act(() => new Promise(resolve => setTimeout(resolve, 1100)));
        expect(rowRenders.count).toBe(1);
        expect(target()).not.toMatch(/bg-primary\/10/);
    });
});
