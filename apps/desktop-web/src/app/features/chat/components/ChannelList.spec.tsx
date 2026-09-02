import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('@chatic/app-runtime', () => ({
    useSessionIdentity: () => ({ userId: 'me' }),
}));

let lastChat: DomainChat | undefined;
vi.mock('../hooks', () => ({ useLastChat: () => lastChat }));
vi.mock('../../../shared/hooks/useAuthorNames', () => ({ useAuthorNames: () => new Map() }));
vi.mock('../../../shared/hooks/useSiteProfiles', () => ({ useSiteProfileMap: () => ({}) }));
// Both mount global keyboard/dialog machinery; this file is about what a row renders.
vi.mock('./QuickSwitcher', () => ({ QuickSwitcher: () => null }));
vi.mock('../../search', () => ({ SearchDialog: () => null }));

import '../../../../i18n';

import { ChannelList } from './ChannelList';

Element.prototype.scrollIntoView = vi.fn();

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const CHANNEL = { id: 'C1', name: 'general' } as DomainChannel;

const list = () => (
    <ChannelList
        channels={[CHANNEL]}
        isLoading={false}
        selectedChannelId={null}
        query=""
        onSelect={vi.fn()}
        isDefaultMode={false}
    />
);

describe('ChannelList preview line', () => {
    it('shows the last message, flattened out of its markdown', () => {
        lastChat = { id: 'C1:1', chatNo: 1, content: '**ship it**' } as DomainChat;

        render(list(), { wrapper });

        expect(screen.getByText('ship it')).toBeTruthy();
    });

    // The preview is the surface where a Block Kit payload is most obviously wrong: the
    // whole line is JSON, and there is no room to recover from it.
    it('reads what a Block Kit message says, not the payload that carries it', () => {
        lastChat = {
            id: 'C1:1',
            chatNo: 1,
            content: JSON.stringify({
                blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '*403* denied by policy' } }],
            }),
        } as DomainChat;

        render(list(), { wrapper });

        expect(screen.getByText('403 denied by policy')).toBeTruthy();
    });

    // The delete is soft, so `content` survives it. Printing that content would show the
    // sidebar the very text the row says is gone.
    it('says a deleted message is gone instead of printing what it said', () => {
        lastChat = { id: 'C1:1', chatNo: 1, content: 'regrettable', hidden: true } as DomainChat;

        render(list(), { wrapper });

        expect(screen.getByText('Message deleted')).toBeTruthy();
        expect(screen.queryByText('regrettable')).toBeNull();
    });
});
