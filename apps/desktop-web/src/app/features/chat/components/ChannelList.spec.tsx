import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
        },
    },
}));

let lastChat: DomainChat | undefined;
vi.mock('../hooks', () => ({ useLastChat: () => lastChat }));
vi.mock('../../../shared/hooks/useAuthorNames', () => ({ useAuthorNames: () => new Map() }));
vi.mock('../../../shared/hooks/useSiteProfiles', () => ({ useSiteProfileMap: () => ({}) }));
// Both mount global keyboard/dialog machinery; this file is about what a row renders.
vi.mock('./QuickSwitcher', () => ({ QuickSwitcher: () => null }));
vi.mock('../../search', () => ({ SearchDialog: () => null }));

import '../../../../i18n';

import { CHANNEL_ROW_HINT_DELAY_MS, ChannelList } from './ChannelList';

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

// The preview rides on the row's hover tooltip (Figma rows are one line), so it is read
// by hovering the row past the row's hint delay.
const previewOnHover = (): string => {
    vi.useFakeTimers();
    try {
        fireEvent.pointerMove(screen.getByRole('button', { name: /general/ }));
        act(() => {
            vi.advanceTimersByTime(CHANNEL_ROW_HINT_DELAY_MS);
        });
        return screen.getByRole('tooltip').textContent ?? '';
    } finally {
        vi.useRealTimers();
    }
};

describe('ChannelList preview line', () => {
    it('shows the last message, flattened out of its markdown', () => {
        lastChat = { id: 'C1:1', chatNo: 1, content: '**ship it**' } as DomainChat;

        render(list(), { wrapper });

        expect(previewOnHover()).toMatch(/ship it$/);
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

        expect(previewOnHover()).toMatch(/403 denied by policy$/);
    });

    // The delete is soft, so `content` survives it. Printing that content would show the
    // sidebar the very text the row says is gone.
    it('says a deleted message is gone instead of printing what it said', () => {
        lastChat = { id: 'C1:1', chatNo: 1, content: 'regrettable', hidden: true } as DomainChat;

        render(list(), { wrapper });

        const preview = previewOnHover();
        expect(preview).toMatch(/Message deleted$/);
        expect(preview).not.toMatch(/regrettable/);
    });
});

describe('ChannelList folded section', () => {
    // Folding hides the quiet rows, never the one that just got a message.
    it('keeps unread channels listed while the section is folded', () => {
        lastChat = undefined;
        const quiet = { id: 'C1', name: 'general' } as DomainChannel;
        const busy = { id: 'C2', name: 'launch', unreadCount: 3 } as DomainChannel;

        render(
            <ChannelList
                channels={[quiet, busy]}
                isLoading={false}
                selectedChannelId={null}
                query=""
                onSelect={vi.fn()}
                isDefaultMode={false}
            />,
            { wrapper }
        );
        fireEvent.click(screen.getByRole('button', { name: 'Channels' }));

        expect(screen.queryByText('general')).toBeNull();
        expect(screen.getByText('launch')).toBeTruthy();
        // Unfold again so the persisted fold does not leak into other tests.
        fireEvent.click(screen.getByRole('button', { name: 'Channels' }));
    });
});
