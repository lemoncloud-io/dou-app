import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type * as AppRuntime from '@chatic/app-runtime';
import type { DomainChannel, DomainChat, DomainLastChat } from '@chatic/data';

import '../../../../../i18n';

import { DM_NAME_WAIT_MS } from '../../hooks/useDmIdentities';
import { useDmNameWaitStore } from '../../stores';
import { DmListPanel } from './DmListPanel';

/** The cache and the profile stores, as each test sets them. */
const current = vi.hoisted(() => ({
    repo: { observeLastList: vi.fn(), refreshList: vi.fn() },
    cloud: new Map<string, { name?: string; thumbnail?: string }>(),
    place: {} as Record<string, { nick?: string; thumbnail?: string }>,
}));

vi.mock('@chatic/app-runtime', async importOriginal => {
    const actual = await importOriginal<typeof AppRuntime>();
    return {
        ...actual,
        runtime: {
            ...actual.runtime,
            session: {
                ...actual.runtime.session,
                useSessionIdentity: () => ({ userId: 'me' }),
                useSessionSelection: () => ({ selectedCloudId: 'cloud-1', selectedSiteId: 'place-1' }),
            },
            connection: { ...actual.runtime.connection, useRuntimeSocketState: () => ({ isVerified: false }) },
            data: { ...actual.runtime.data, useRuntimeRepositories: () => ({ chat: current.repo, user: {} }) },
        },
    };
});
vi.mock('../../../../shared/hooks/useAuthorNames', () => ({ useCloudProfiles: () => current.cloud }));
vi.mock('../../../../shared/hooks/useSiteProfiles', () => ({ useSiteProfileMap: () => current.place }));

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const MIN = 60_000;

const dm = (id: string, peerId: string, over: Partial<DomainChannel> = {}) =>
    ({ id, name: '', stereo: 'dm', memberIds: ['me', peerId], updatedAt: NOW - 600 * MIN, ...over }) as DomainChannel;

const chat = (channelId: string, chatNo: number, content: string, at: number, ownerId = 'peer') =>
    ({ id: `${channelId}-${chatNo}`, channelId, chatNo, content, createdAt: at, ownerId }) as DomainChat;

let emit: (rows: DomainLastChat[]) => void = () => undefined;

const renderPanel = (channels: DomainChannel[], over: Partial<Parameters<typeof DmListPanel>[0]> = {}) => {
    const onSelect = vi.fn();
    const onCreateDm = vi.fn();
    render(
        <DmListPanel
            channels={channels}
            selectedChannelId={null}
            onSelect={onSelect}
            onCreateDm={onCreateDm}
            {...over}
        />
    );
    return { onSelect, onCreateDm };
};

const rows = () => screen.queryAllByRole('listitem').map(row => row.textContent ?? '');

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    current.repo = { observeLastList: vi.fn(), refreshList: vi.fn() };
    current.repo.observeLastList.mockImplementation((_ids: string[], callback: typeof emit) => {
        emit = callback;
        return () => undefined;
    });
    current.repo.refreshList.mockResolvedValue({});
    current.cloud = new Map([
        ['ada', { name: 'Ada' }],
        ['bo', { name: 'Bo' }],
    ]);
    current.place = {};
    useDmNameWaitStore.setState({ settled: {}, gaveUp: {} });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('DmListPanel', () => {
    it("lists the place's 1:1s, not its channels, each under its person's name with the last message", () => {
        renderPanel([
            dm('d-ada', 'ada'),
            { id: 'general', name: 'general', stereo: 'public' } as DomainChannel,
            dm('d-bo', 'bo'),
        ]);
        act(() => emit([{ channelId: 'd-ada', lastNo: 3, chat: chat('d-ada', 3, 'lunch?', NOW - 5 * MIN, 'ada') }]));

        expect(current.repo.observeLastList).toHaveBeenCalledTimes(1);
        expect(current.repo.observeLastList.mock.calls[0][0]).toEqual(['d-ada', 'd-bo']);
        const [ada, bo] = rows();
        expect(ada).toContain('Ada');
        expect(ada).toContain('lunch?');
        expect(ada).not.toContain('Ada: lunch?');
        expect(bo).toContain('Bo');
        expect(bo).toContain('No messages yet');
        expect(rows()).toHaveLength(2);
    });

    it("names a person by this place's profile before their cloud one", () => {
        current.place = { ada: { nick: 'Ada in this place' } };
        renderPanel([dm('d-ada', 'ada')]);

        expect(rows()[0]).toContain('Ada in this place');
    });

    it('marks my own last message as mine', () => {
        renderPanel([dm('d-ada', 'ada')]);
        act(() => emit([{ channelId: 'd-ada', lastNo: 2, chat: chat('d-ada', 2, 'see you', NOW - MIN, 'me') }]));

        expect(rows()[0]).toContain('You: see you');
    });

    it('knows my message by my id in this cloud too, as the server rewrites it once it persists', () => {
        renderPanel([
            dm('d-ada', 'ada', {
                memberIds: ['me-in-cloud', 'ada'],
                $join: { userId: 'me-in-cloud' } as DomainChannel['$join'],
            }),
        ]);
        act(() =>
            emit([{ channelId: 'd-ada', lastNo: 2, chat: chat('d-ada', 2, 'on my way', NOW - MIN, 'me-in-cloud') }])
        );

        expect(rows()[0]).toContain('You: on my way');
    });

    it('does not mark messages as mine in my notes-to-self room, where every one is', () => {
        renderPanel([{ id: 'self', stereo: 'self', memberIds: ['me'] } as DomainChannel]);
        act(() => emit([{ channelId: 'self', lastNo: 1, chat: chat('self', 1, 'buy milk', NOW - MIN, 'me') }]));

        expect(rows()[0]).toContain('buy milk');
        expect(rows()[0]).not.toContain('You: buy milk');
    });

    it('orders the conversations by their last activity, my notes-to-self room among them', () => {
        renderPanel([
            dm('d-ada', 'ada'),
            dm('d-bo', 'bo'),
            { id: 'self', stereo: 'self', memberIds: ['me'], updatedAt: NOW - 30 * MIN } as DomainChannel,
        ]);
        act(() =>
            emit([
                { channelId: 'd-ada', lastNo: 1, chat: chat('d-ada', 1, 'a', NOW - 300 * MIN, 'ada') },
                { channelId: 'd-bo', lastNo: 4, chat: chat('d-bo', 4, 'b', NOW - MIN, 'bo') },
            ])
        );

        // Each row's text opens with the avatar's initial, then the name.
        expect(rows().map(text => /(Ada|Bo|You)/.exec(text)?.[1])).toEqual(['Bo', 'You', 'Ada']);
    });

    it('draws a placeholder, never the raw id, until the person is named', () => {
        const view = render(
            <DmListPanel channels={[dm('d-x', 'user-7f3a')]} selectedChannelId={null} onSelect={vi.fn()} />
        );

        expect(screen.queryByText(/user-7f3a/)).toBeNull();
        expect(rows()).toHaveLength(0);
        expect(view.container.querySelectorAll('li[aria-hidden]')).toHaveLength(1);

        current.cloud = new Map([['user-7f3a', { name: 'Cy' }]]);
        view.rerender(<DmListPanel channels={[dm('d-x', 'user-7f3a')]} selectedChannelId={null} onSelect={vi.fn()} />);
        expect(rows()[0]).toContain('Cy');
    });

    it('waits for a name that never arrives once per place, not on every visit to the list', () => {
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
        vi.setSystemTime(NOW);
        const lost = [dm('d-x', 'gone', { name: 'Old room' })];
        const first = render(<DmListPanel channels={lost} selectedChannelId={null} onSelect={vi.fn()} />);
        expect(rows()).toHaveLength(0);

        act(() => vi.advanceTimersByTime(DM_NAME_WAIT_MS));
        expect(rows()[0]).toContain('Old room');
        first.unmount();

        render(<DmListPanel channels={lost} selectedChannelId={null} onSelect={vi.fn()} />);
        expect(rows()[0]).toContain('Old room');
    });

    it('matches a search against names shown, not against rows still waiting for one', () => {
        renderPanel([dm('d-ada', 'ada'), dm('d-x', 'user-7f3a', { name: 'user-room' })]);

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search direct messages' }), {
            target: { value: 'user' },
        });

        expect(screen.getByText('No conversations match “user”')).toBeTruthy();
    });

    it('marks unread conversations with their count, and opens the one picked', () => {
        const { onSelect } = renderPanel([dm('d-ada', 'ada', { unreadCount: 2 })]);

        expect(screen.getByText('2 unread messages')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Ada/ }));
        expect(onSelect).toHaveBeenCalledWith('d-ada');
    });

    it("narrows the list by the person's name, and says so when nothing matches", () => {
        renderPanel([dm('d-ada', 'ada'), dm('d-bo', 'bo')]);
        const search = screen.getByRole('searchbox', { name: 'Search direct messages' });

        fireEvent.change(search, { target: { value: 'ad' } });
        expect(rows()).toHaveLength(1);
        expect(rows()[0]).toContain('Ada');

        fireEvent.change(search, { target: { value: 'zzz' } });
        expect(rows()).toHaveLength(0);
        expect(screen.getByText('No conversations match “zzz”')).toBeTruthy();
    });

    it('offers a new message when the place has no conversation, and only where one can be started', () => {
        const { onCreateDm } = renderPanel([{ id: 'general', name: 'general', stereo: 'public' } as DomainChannel]);

        expect(screen.getByText('No conversations yet')).toBeTruthy();
        expect(current.repo.observeLastList).not.toHaveBeenCalled();
        // The header's + and the empty state's button both start one.
        fireEvent.click(screen.getAllByRole('button', { name: 'New message' }).at(-1) as HTMLElement);
        expect(onCreateDm).toHaveBeenCalled();
    });

    it('offers no new message where the place cannot start one', () => {
        renderPanel([], { onCreateDm: undefined });

        expect(screen.getByText('No conversations yet')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'New message' })).toBeNull();
    });

    it("says nothing about an empty place while the place's channels load", () => {
        renderPanel([], { isLoading: true });

        expect(screen.queryByText('No conversations yet')).toBeNull();
    });
});
