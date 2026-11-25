import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, render, screen } from '@testing-library/react';

import type { DomainChat } from '@chatic/runtime';
import { TooltipProvider } from '@chatic/ui-kit';

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

import { useSiteProfilesStore } from '../../../shared/stores';
import { MessageList } from './MessageList';

Element.prototype.scrollIntoView = vi.fn();

const VIEWER = { uid: 'me', name: 'Me', cloudUid: 'me-cloud' };

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const message = (chatNo: number, ownerId: string, content: string): DomainChat =>
    ({
        id: `C1:${chatNo}`,
        channelId: 'C1',
        chatNo,
        ownerId,
        content,
        createdAt: 1_700_000_000_000 + chatNo,
    }) as DomainChat;

const reactions = new Map([['C1:1', [{ emoji: '👍', key: '👍', userIds: ['me', 'ada'], mine: true }]]]);

const renderList = () =>
    render(
        <MessageList
            messages={[message(1, 'ada', 'reacted to')]}
            reactions={reactions}
            isLoading={false}
            viewer={VIEWER}
            names={new Map([['ada', 'Ada']])}
        />,
        { wrapper }
    );

afterEach(() => {
    cleanup();
    useSiteProfilesStore.getState().reset();
});

describe('MessageList reactor names', () => {
    it('names me by my place nickname, under either of my ids', () => {
        useSiteProfilesStore.getState().setAll({ 'me-cloud': { nick: 'Captain' } });
        renderList();
        expect(screen.getByLabelText('👍 · Captain, Ada')).toBeDefined();
    });

    it('names me by the nickname keyed under my account id too', () => {
        useSiteProfilesStore.getState().setAll({ me: { nick: 'Captain' } });
        renderList();
        expect(screen.getByLabelText('👍 · Captain, Ada')).toBeDefined();
    });

    it('names another reactor by their place nickname', () => {
        useSiteProfilesStore.getState().setAll({ ada: { nick: 'Countess' } });
        renderList();
        expect(screen.getByLabelText('👍 · Me, Countess')).toBeDefined();
    });

    it('prefers the nickname under my cloud id when both of my ids have one', () => {
        useSiteProfilesStore.getState().setAll({ me: { nick: 'Account side' }, 'me-cloud': { nick: 'Cloud side' } });
        renderList();
        expect(screen.getByLabelText('👍 · Cloud side, Ada')).toBeDefined();
    });

    it('follows a nickname change without a reload', () => {
        renderList();
        expect(screen.getByLabelText('👍 · Me, Ada')).toBeDefined();
        act(() => useSiteProfilesStore.getState().setAll({ 'me-cloud': { nick: 'Skipper' } }));
        expect(screen.getByLabelText('👍 · Skipper, Ada')).toBeDefined();
    });
});
