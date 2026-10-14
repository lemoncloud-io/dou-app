import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, render, screen } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';
import { MSG_MENTION_CLASS, MSG_MENTION_SELF_CLASS } from '@chatic/block-kit';
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

import { useSiteProfilesStore } from '../../../shared/stores/useSiteProfilesStore';
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

// The composer inserts the name autocomplete showed — the Place Profile nick when a
// member has one. A mention of that member has to open their profile all the same.
describe('MessageList mentions', () => {
    afterEach(() => {
        cleanup();
        useSiteProfilesStore.getState().reset();
    });

    it('opens the profile of a member mentioned by their place nick', () => {
        useSiteProfilesStore.getState().setAll({ rain: { nick: '레인' } });

        render(
            <MessageList
                messages={[message(1, 'me', '@레인 @Aiden test')]}
                isLoading={false}
                viewer={VIEWER}
                names={
                    new Map([
                        ['rain', 'Rain Kim'],
                        ['aiden', 'Aiden'],
                    ])
                }
            />,
            { wrapper }
        );

        expect(screen.getByRole('button', { name: '@Aiden' })).toBeDefined();
        expect(screen.getByRole('button', { name: '@레인' })).toBeDefined();
    });

    const recorded = (chatNo: number, content: string, mention$: DomainChat['mention$']): DomainChat => ({
        ...message(chatNo, 'someone', content),
        mention$,
    });

    const renderList = (messages: DomainChat[], names = new Map<string, string>()) =>
        render(<MessageList messages={messages} isLoading={false} viewer={VIEWER} names={names} />, { wrapper });

    it('draws my name as a mention of me in a message that has no record', () => {
        renderList([message(1, 'someone', '@Me hi')]);

        expect(screen.getByText('@Me').className).toContain(MSG_MENTION_SELF_CLASS);
    });

    // Someone else of the same name was picked: the record says it was not me.
    it('draws my name as an ordinary mention when the record names someone else', () => {
        renderList([recorded(1, '@Me hi', { userIds: ['u-other'] })]);

        expect(screen.getByText('@Me').className).toContain(MSG_MENTION_CLASS);
        expect(screen.getByText('@Me').className).not.toContain(MSG_MENTION_SELF_CLASS);
    });

    it('draws a typed group word as an ordinary mention when the record names someone else', () => {
        renderList([recorded(1, '@channel hi', { userIds: ['u-other'] })]);

        expect(screen.getByText('@channel').className).not.toContain(MSG_MENTION_SELF_CLASS);
    });

    // The sender's list showed me under the name the roster has for my id, not my own profile name.
    it('draws the name the roster has for me as a mention of me when the record names me', () => {
        renderList([recorded(1, '@Mina hi', { userIds: ['me-cloud'] })], new Map([['me-cloud', 'Mina']]));

        expect(screen.getByText('@Mina').className).toContain(MSG_MENTION_SELF_CLASS);
    });
});
