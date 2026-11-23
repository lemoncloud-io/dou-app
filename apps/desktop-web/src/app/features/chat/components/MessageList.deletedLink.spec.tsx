import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '@testing-library/react';

import type { DomainChat } from '@chatic/runtime';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('@chatic/runtime', async () => {
    const testing = await import('@chatic/runtime/testing');
    return testing.fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => ({
                chat: { updateChat: vi.fn(), deleteChat: vi.fn(), setReaction: vi.fn() },
            }),
        },
        session: {
            getActiveServerContext: () => ({ siteId: 'S1' }),
            useGlobalSession: () => ({ activeServer: { siteId: 'S1' } }),
        },
        links: {
            ...testing.browserLinks(),
            kind: 'shell',
            linkPreview: {
                fetch: () =>
                    Promise.resolve({
                        success: true,
                        url: 'https://leki.example/',
                        title: 'leki wiki',
                        siteName: 'leki',
                    }),
            },
        },
    });
});

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

    it('draws no link card under a deleted message', async () => {
        render(<MessageList messages={[chat(true)]} isLoading={false} viewer={VIEWER} names={new Map()} />, {
            wrapper,
        });

        expect(screen.getByText('This message was deleted.')).toBeDefined();
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(screen.queryByText('leki wiki')).toBeNull();
    });
});
