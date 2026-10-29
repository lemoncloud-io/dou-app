import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '@testing-library/react';

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

// The link card only draws inside the desktop shell, which answers `FetchUrlMetadata`
// with the unfurled page. Faking the bridge makes every link "resolve" to a card.
vi.mock('@chatic/bridges', async importOriginal => ({
    ...(await importOriginal<object>()),
    isNative: () => true,
    webClient: {
        request: vi.fn().mockResolvedValue({
            data: { success: true, url: 'https://leki.example/', title: 'leki wiki', siteName: 'leki' },
        }),
    },
}));

import '../../../../i18n';

import { MessageList } from './MessageList';

Element.prototype.scrollIntoView = vi.fn();
Range.prototype.getBoundingClientRect = () => new DOMRect();
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const VIEWER = { uid: 'me', name: 'Me', cloudUid: 'me-cloud' };

const chat = (hidden: boolean): DomainChat =>
    ({
        id: 'C1:1',
        channelId: 'C1',
        chatNo: 1,
        ownerId: 'ada',
        content: 'https://leki.example/',
        createdAt: 1_700_000_000_001,
        hidden,
    }) as DomainChat;

describe('MessageList — link card under a message', () => {
    it('draws the card for a live message with a link (control)', async () => {
        render(<MessageList messages={[chat(false)]} isLoading={false} viewer={VIEWER} names={new Map()} />, {
            wrapper,
        });

        await waitFor(() =>
            expect(screen.getAllByRole('link').some(a => a.textContent?.includes('leki wiki'))).toBe(true)
        );
    });

    // A deleted message soft-deletes: `content` survives with `hidden` set. The row says
    // "This message was deleted." — a card under it hands the deleted link back.
    it('draws no link card under a deleted message', async () => {
        render(<MessageList messages={[chat(true)]} isLoading={false} viewer={VIEWER} names={new Map()} />, {
            wrapper,
        });

        expect(screen.getByText('This message was deleted.')).toBeDefined();
        // Give the card's metadata request every chance to resolve before asserting absence.
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(screen.queryByText('leki wiki')).toBeNull();
    });
});
