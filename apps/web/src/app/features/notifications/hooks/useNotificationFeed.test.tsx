import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';

import { runtime, type DomainChannel, type DomainChat, type DomainJoin } from '@chatic/runtime';

import { ActiveCloudDataContext, type ActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { useNotificationStore } from '../../../stores/useNotificationStore';
import { EMPTY_OVERLAY } from '../../../utils/notifications';
import { NOTIFICATION_ROOM_ROWS, useNotificationFeed } from './useNotificationFeed';

jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        session: { useSessionSelection: jest.fn(), useUidInCloud: jest.fn(), useSessionIdentity: jest.fn() },
        connection: { useCloudVerified: jest.fn() },
        sync: { registerSyncTarget: jest.fn() },
        data: { useRuntimeRepositories: jest.fn(), getCloudRepositories: jest.fn() },
    })
);

type Emit = (rows: DomainChat[]) => void;
const observers = new Map<string, Emit>();
const unsubscribe = jest.fn();
const observeList = jest.fn((query: { channelId: string }, cb: (result: { list: DomainChat[] }) => void) => {
    observers.set(query.channelId, rows => cb({ list: rows }));
    return unsubscribe;
});
const cacheRead = jest.fn();
const getChat = jest.fn();

let data: ActiveCloudData;
const Wrapper = ({ children }: { children: ReactNode }) => (
    <ActiveCloudDataContext.Provider value={data}>{children}</ActiveCloudDataContext.Provider>
);

const channel = (overrides: Partial<DomainChannel> = {}): DomainChannel =>
    ({ id: 'ch1', cid: 'c1', sid: 'p1', stereo: 'public', name: 'general', ...overrides }) as unknown as DomainChannel;
const join = (channelId: string, chatNo: number): DomainJoin =>
    ({ id: `${channelId}@me`, channelId, userId: 'me', chatNo }) as unknown as DomainJoin;

const now = Date.now();
const row = (chatNo: number, fields: Record<string, unknown> = {}): DomainChat =>
    ({
        id: `ch1:${chatNo}`,
        channelId: 'ch1',
        chatNo,
        createdAt: now,
        ownerId: 'u-other',
        owner$: { id: 'u-other', name: 'Minsu' },
        content: `message ${chatNo}`,
        isPending: false,
        isFailed: false,
        ...fields,
    }) as unknown as DomainChat;
const mention = (chatNo: number) => row(chatNo, { mention$: { userIds: ['me'] } });

const render = (channels: DomainChannel[], myJoins = new Map<string, DomainJoin>()) => {
    data = { channels, isLoaded: true, myJoins, unreads: {} as never };
    const hook = renderHook(() => useNotificationFeed(), { wrapper: Wrapper });
    const update = (next: Partial<ActiveCloudData>) => {
        data = { ...data, ...next };
        hook.rerender();
    };
    return { ...hook, update };
};
const emit = (channelId: string, rows: DomainChat[]) => act(() => observers.get(channelId)?.(rows));
const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 0)));
const items = () => useNotificationStore.getState().items;

beforeEach(() => {
    jest.clearAllMocks();
    observers.clear();
    useNotificationStore.setState({ computed: {}, overlay: EMPTY_OVERLAY, items: {}, computedRooms: {} });
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: 'c1', selectedSiteId: 'p1' });
    (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me');
    (runtime.session.useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'acct' });
    (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
    (runtime.sync.registerSyncTarget as jest.Mock).mockReturnValue(jest.fn());
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ chat: { observeList, cacheRead } });
    (runtime.data.getCloudRepositories as jest.Mock).mockReturnValue({ chat: { getChat } });
    cacheRead.mockResolvedValue(null);
});

describe('useNotificationFeed', () => {
    it("observes each room's newest rows and fills the inbox from them", () => {
        render([channel(), channel({ id: 'ch2' })]);

        expect(observeList).toHaveBeenCalledWith(
            { channelId: 'ch1', limit: NOTIFICATION_ROOM_ROWS, includeUnsent: true },
            expect.any(Function)
        );
        expect(observeList).toHaveBeenCalledWith(
            { channelId: 'ch2', limit: NOTIFICATION_ROOM_ROWS, includeUnsent: true },
            expect.any(Function)
        );
        emit('ch1', [mention(5), row(6)]);

        expect(Object.keys(items())).toEqual(['c1:ch1:5']);
        expect(items()['c1:ch1:5']).toMatchObject({ kind: 'mention', placeId: 'p1', channelName: 'general' });
    });

    it('works a room out again when its rows change, and drops what the rows no longer say', () => {
        render([channel()]);
        emit('ch1', [mention(5)]);

        emit('ch1', [row(5)]);

        expect(items()).toEqual({});
    });

    it('reads an item as read once the room cursor passes it', () => {
        const { update } = render([channel()], new Map([['ch1', join('ch1', 0)]]));
        emit('ch1', [mention(5)]);
        expect(items()['c1:ch1:5'].read).toBe(false);

        update({ myJoins: new Map([['ch1', join('ch1', 5)]]) });

        expect(items()['c1:ch1:5'].read).toBe(true);
    });

    it('reads a thread root outside the window from the cache, then the server, once, and files the reply', async () => {
        getChat.mockResolvedValue(row(7, { ownerId: 'me', owner$: { id: 'me' }, content: 'my question' }));
        render([channel()]);

        emit('ch1', [row(9, { parentId: '7' })]);
        await settle();
        emit('ch1', [row(9, { parentId: '7' }), row(10, { parentId: '7' })]);
        await settle();

        expect(cacheRead).toHaveBeenCalledWith('ch1:7');
        expect(getChat).toHaveBeenCalledTimes(1);
        expect(getChat).toHaveBeenCalledWith({ id: 'ch1:7' });
        expect(Object.values(items()).map(item => [item.kind, item.quote])).toEqual([
            ['replyToMine', 'my question'],
            ['replyToMine', 'my question'],
        ]);
    });

    it('looks a reaction target up in the cache only', async () => {
        cacheRead.mockResolvedValue(row(3, { ownerId: 'me', owner$: { id: 'me' }, content: 'my photo' }));
        render([channel()]);

        emit('ch1', [
            row(4, { stereo: 'system', subType: 'reaction', content: '', reaction$: { chatId: 'ch1:3', emoji: '👍' } }),
        ]);
        await settle();

        expect(cacheRead).toHaveBeenCalledWith('ch1:3');
        expect(getChat).not.toHaveBeenCalled();
        expect(Object.values(items()).map(item => [item.kind, item.quote])).toEqual([['reaction', 'my photo']]);
    });

    it('drops the items of a room that left the place and stops observing it', () => {
        const { update } = render([channel(), channel({ id: 'ch2' })]);
        emit('ch2', [{ ...mention(5), id: 'ch2:5', channelId: 'ch2' } as DomainChat]);
        expect(Object.keys(items())).toEqual(['c1:ch2:5']);

        update({ channels: [channel()] });

        expect(items()).toEqual({});
        expect(unsubscribe).toHaveBeenCalled();
    });

    it("keeps a deleted item away when the room's rows arrive again", () => {
        render([channel()]);
        emit('ch1', [mention(5)]);
        act(() => {
            useNotificationStore.getState().remove(['c1:ch1:5']);
        });

        emit('ch1', [mention(5), mention(6)]);

        expect(Object.keys(items())).toEqual(['c1:ch1:6']);
    });
});
