import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { DomainChannel } from '@chatic/data';
import type * as SharedLib from '@chatic/shared';

const rows: DomainChannel[] = [
    { id: 'C1', name: 'general', sid: 'p1', ownerId: 'me', unreadCount: 2, chatNo: 7 } as DomainChannel,
    { id: 'C2', name: 'random', sid: 'p1', ownerId: 'u9', unreadCount: 0, chatNo: 3 } as DomainChannel,
];

const deleteChannel = vi.fn(async () => ({}));
const leaveChannel = vi.fn(async () => ({}));
const readChat = vi.fn(async () => ({}));

// Stable across renders: `useChannels` re-subscribes when the repositories
// object changes identity, and a fresh object per render loops forever.
const repositories = {
    channel: {
        observeList: (_q: unknown, cb: (r: { list: DomainChannel[] }) => void) => {
            cb({ list: rows });
            return () => undefined;
        },
        deleteChannel: (...args: unknown[]) => deleteChannel(...args),
        leaveChannel: (...args: unknown[]) => leaveChannel(...args),
    },
    join: {
        readChat: (...args: unknown[]) => readChat(...args),
        observeList: (_q: unknown, cb: (r: { list: never[] }) => void) => {
            cb({ list: [] });
            return () => undefined;
        },
    },
    place: {
        observeList: (_q: unknown, cb: (r: { list: never[] }) => void) => {
            cb({ list: [] });
            return () => undefined;
        },
    },
};

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => repositories,
        },
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedCloudId: 'c1', selectedSiteId: 'p1' }),
            useGlobalSession: () => ({ activeServer: { kind: 'cloud', cloudId: 'c1' }, identity: { userId: 'me' } }),
            useUidInCloud: () => 'me',
        },
        connection: {
            useRuntimeSocketState: () => ({ isVerified: true }),
            useCloudVerified: () => true,
        },
        sync: { getSyncManager: () => ({ registerJoin: () => () => undefined }) },
    },
}));

const pinned = vi.hoisted(() => ({ ids: [] as string[], toggle: vi.fn() }));
vi.mock('@chatic/shared', async () => ({
    ...(await vi.importActual<SharedLib>('@chatic/shared')),
    usePinnedChannels: () => ({ pinnedIds: pinned.ids, toggle: pinned.toggle, reorder: vi.fn() }),
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));

import '../../../../i18n';

import { useReadCursorStore } from '../../../shared';
import { PlaceChannelsPage } from './PlaceChannelsPage';

const renderAt = () =>
    render(
        <MemoryRouter initialEntries={['/places/p1/channels']}>
            <Routes>
                <Route path="/places/:placeId/channels" element={<PlaceChannelsPage />} />
            </Routes>
        </MemoryRouter>
    );

const toggleRow = (name: string) => {
    const row = screen.getByText(name).closest('li') as HTMLElement;
    const box = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(box);
};

describe('PlaceChannelsPage', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        pinned.ids = [];
        useReadCursorStore.setState({ cursors: {} });
    });

    it('lists the place channels with selection boxes', () => {
        renderAt();

        expect(screen.getByText('general')).toBeTruthy();
        expect(screen.getByText('random')).toBeTruthy();
        expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    });

    it('pins through the shared favorites record', () => {
        renderAt();
        toggleRow('general');

        fireEvent.click(screen.getByRole('button', { name: 'Pin selected' }));

        expect(pinned.toggle).toHaveBeenCalledWith('C1');
    });

    it('marks every selected channel read, locally and on the server', async () => {
        renderAt();
        toggleRow('general');
        toggleRow('random');

        fireEvent.click(screen.getByRole('button', { name: 'Mark selected read' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(useReadCursorStore.getState().cursors).toEqual({ C1: 7, C2: 3 });
        expect(readChat).toHaveBeenCalledWith({ channelId: 'C1', chatNo: 7 });
        expect(readChat).toHaveBeenCalledWith({ channelId: 'C2', chatNo: 3 });
        expect(toast).not.toHaveBeenCalled();
    });

    it('announces a failed bulk mark-read once, not once per row', async () => {
        readChat.mockRejectedValue(new Error('offline'));
        renderAt();
        toggleRow('general');
        toggleRow('random');

        fireEvent.click(screen.getByRole('button', { name: 'Mark selected read' }));

        await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Could not mark as read.', variant: 'destructive' })
        );
        readChat.mockReset();
        readChat.mockImplementation(async () => ({}));
    });

    it('deletes an owned channel only after confirming', async () => {
        renderAt();
        const row = screen.getByText('general').closest('li') as HTMLElement;
        fireEvent.click(row.querySelector('button[aria-label="Delete channel"]') as HTMLElement);

        // The confirm guards a destructive, irreversible write.
        expect(deleteChannel).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(deleteChannel).toHaveBeenCalledWith({ channelId: 'C1' });
    });

    it('leaves a channel it does not own after confirming', async () => {
        renderAt();
        const row = screen.getByText('random').closest('li') as HTMLElement;
        fireEvent.click(row.querySelector('button[aria-label="Leave channel"]') as HTMLElement);
        fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(leaveChannel).toHaveBeenCalledWith({ channelId: 'C2' });
        expect(deleteChannel).not.toHaveBeenCalled();
    });

    it('announces a delete the server refuses', async () => {
        deleteChannel.mockRejectedValueOnce(new Error('denied'));
        renderAt();
        const row = screen.getByText('general').closest('li') as HTMLElement;
        fireEvent.click(row.querySelector('button[aria-label="Delete channel"]') as HTMLElement);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
});
