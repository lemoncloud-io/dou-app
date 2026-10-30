import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { useSavedItemsStore } from '../../../shared';
import { ThreadCardMessages } from './ThreadCardMessages';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ user: { observeItem: () => () => undefined } }),
        },
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useRuntimeProfile: () => ({ userName: 'Me', photo: '' }),
        },
    },
}));
vi.mock('@chatic/bridges', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../../../shared/hooks/useChatMutations', () => ({
    useChatMutations: () => ({ sendMessage: vi.fn(), retryMessage: vi.fn(), discardMessage: vi.fn() }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
);

const CHANNEL = { id: 'C1', name: 'general', stereo: 'public' } as DomainChannel;
const MESSAGE = {
    id: 'C1:6',
    channelId: 'C1',
    chatNo: 6,
    content: 'message 6',
    createdAt: 6000,
    owner$: { name: 'Ada' },
} as DomainChat;

const renderRows = (hideSavedMark?: boolean) =>
    render(
        <ThreadCardMessages
            channel={CHANNEL}
            messages={[MESSAGE]}
            onRetry={vi.fn()}
            onDiscard={vi.fn()}
            hideSavedMark={hideSavedMark}
        />,
        { wrapper }
    );

beforeEach(() => {
    useSavedItemsStore.setState({
        items: {
            'C1:6': { id: 'C1:6', channelId: 'C1', chatNo: 6, content: 'message 6', ownerName: 'Ada', savedAt: 1 },
        },
    });
});

describe('ThreadCardMessages saved tag', () => {
    it('shows the saved tag on a saved message', () => {
        renderRows();
        expect(screen.getByText('Saved')).toBeTruthy();
    });

    it('leaves the saved tag out when the surface asks it to', () => {
        renderRows(true);
        expect(screen.getByText('message 6')).toBeTruthy();
        expect(screen.queryByText('Saved')).toBeNull();
    });
});
