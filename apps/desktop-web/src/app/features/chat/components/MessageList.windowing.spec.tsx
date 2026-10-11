import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

const updateChat = vi.hoisted(() => vi.fn());
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat, deleteChat: vi.fn(), setReaction: vi.fn() },
            }),
        },
        session: {
            getActiveServerContext: () => ({ siteId: 'S1' }),
            useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
        },
    },
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
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

// Authors alternate, so every message is its own block: one row per message.
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

/**
 * Windowing engages only once layout exists (the mount effect reads the real
 * container). jsdom ships no layout, so these tests stand it in: a 600px
 * viewport over a 30000px feed. Without the mocks everything mounts whole —
 * the contract every older feed test relies on.
 */
describe('MessageList windowing', { timeout: 30_000 }, () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    const renderFeed = (extra?: Partial<Parameters<typeof MessageList>[0]>) =>
        render(<MessageList messages={FEED} isLoading={false} viewer={VIEWER} names={NAMES} {...extra} />, { wrapper });

    const scrollerOf = (container: HTMLElement): HTMLElement => {
        const scroller = container.querySelector<HTMLElement>('.overflow-y-auto');
        expect(scroller).toBeTruthy();
        if (!scroller) throw new Error('feed scroller missing');
        return scroller;
    };

    const mockLayout = () => {
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(30000);
    };

    const mountedRows = (container: HTMLElement) => container.querySelectorAll('[data-row-key]').length;
    const spacerHeight = (container: HTMLElement, which: string) => {
        const spacer = container.querySelector(`[data-feed-spacer="${which}"]`);
        return spacer ? (spacer as HTMLElement).style.height : null;
    };

    it('mounts the whole feed before layout exists', () => {
        const { container } = renderFeed();
        expect(container.querySelector('[data-chat-no="1"]')).toBeTruthy();
        expect(container.querySelector('[data-chat-no="200"]')).toBeTruthy();
        expect(container.querySelector('[data-feed-spacer]')).toBeNull();
    });

    it('windows to the viewport once layout is known, holding the rest as a spacer', async () => {
        mockLayout();
        const { container } = renderFeed();
        const scroller = scrollerOf(container);

        fireEvent.scroll(scroller);
        await waitFor(() => expect(mountedRows(container)).toBeLessThan(100));

        expect(container.querySelector('[data-chat-no="1"]')).toBeTruthy();
        expect(container.querySelector('[data-chat-no="200"]')).toBeNull();
        expect(spacerHeight(container, 'top')).toBeNull();
        const bottom = spacerHeight(container, 'bottom');
        expect(bottom).toBeTruthy();
        expect(parseFloat(bottom ?? '')).toBeGreaterThan(0);
    });

    it('slides the window on scroll, spacing both ends', async () => {
        mockLayout();
        const { container } = renderFeed();
        const scroller = scrollerOf(container);

        scroller.scrollTop = 15000;
        fireEvent.scroll(scroller);
        await waitFor(() => expect(spacerHeight(container, 'top')).toBeTruthy());

        expect(container.querySelector('[data-chat-no="1"]')).toBeNull();
        expect(container.querySelector('[data-chat-no="200"]')).toBeNull();
        expect(parseFloat(spacerHeight(container, 'top') ?? '')).toBeGreaterThan(0);
        expect(parseFloat(spacerHeight(container, 'bottom') ?? '')).toBeGreaterThan(0);
        expect(mountedRows(container)).toBeLessThan(100);
    });

    it('scrolls an unmounted jump target into its window and flashes it', async () => {
        mockLayout();
        const onJumpConsumed = vi.fn();
        const { container, rerender } = renderFeed();
        const scroller = scrollerOf(container);

        // Park at the bottom first, so the target (near the top) is unmounted.
        scroller.scrollTop = 29000;
        fireEvent.scroll(scroller);
        await waitFor(() => expect(container.querySelector('[data-chat-no="5"]')).toBeNull());

        rerender(
            <MessageList
                messages={FEED}
                isLoading={false}
                viewer={VIEWER}
                names={NAMES}
                jumpTarget={{ chatNo: 5, nonce: 7 }}
                onJumpConsumed={onJumpConsumed}
            />
        );

        // The target mounts on an estimated scroll, then the next retry lands on it.
        await waitFor(() => expect(onJumpConsumed).toHaveBeenCalled());
        expect(container.querySelector('[data-chat-no="5"]')?.outerHTML).toMatch(/bg-primary\/10/);
    });
});
