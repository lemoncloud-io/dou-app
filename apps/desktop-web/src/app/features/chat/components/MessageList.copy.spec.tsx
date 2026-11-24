import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render } from '@testing-library/react';

import type { DomainChat } from '@chatic/runtime';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('@chatic/runtime', async () =>
    (await import('@chatic/runtime/testing')).fakeRuntimeModule({
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

const message = (chatNo: number, ownerId: string): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        ownerId,
        content: `message ${chatNo}`,
        createdAt: 1_700_000_000_000 + chatNo * 60_000,
    }) as DomainChat;

const FEED = [message(1, 'ada'), message(2, 'bo')];

const selectText = (from: Node, to: Node) => {
    const range = document.createRange();
    range.setStart(from, 0);
    range.setEnd(to, to.textContent?.length ?? 0);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
};

const textNode = (container: HTMLElement, text: string): Node => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent === text) return node;
    }
    throw new Error(`no text node "${text}"`);
};

const copy = (target: Element) => {
    const setData = vi.fn();
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.assign(event, { clipboardData: { setData } });
    fireEvent(target, event);
    return { setData, prevented: event.defaultPrevented };
};

describe('MessageList copy', () => {
    afterEach(() => {
        window.getSelection()?.removeAllRanges();
        cleanup();
    });

    const renderFeed = () =>
        render(<MessageList messages={FEED} isLoading={false} viewer={VIEWER} names={NAMES} />, { wrapper });

    it('copies a selection across messages as time, author and text lines', () => {
        const { container, getByRole } = renderFeed();
        selectText(textNode(container, 'message 1'), textNode(container, 'message 2'));

        const { setData, prevented } = copy(getByRole('log'));

        expect(prevented).toBe(true);
        expect(setData).toHaveBeenCalledWith(
            'text/plain',
            expect.stringMatching(/^\S.* Ada message 1\n\S.* Bo message 2$/)
        );
    });

    it('leaves a selection inside one message to the browser', () => {
        const { container, getByRole } = renderFeed();
        const one = textNode(container, 'message 1');
        selectText(one, one);

        const { setData, prevented } = copy(getByRole('log'));

        expect(prevented).toBe(false);
        expect(setData).not.toHaveBeenCalled();
    });
});
