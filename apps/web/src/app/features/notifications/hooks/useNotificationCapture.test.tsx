import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel, DomainChat, DomainJoin } from '@chatic/data';

import { ActiveCloudDataContext, type ActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { useNotificationStore, useThreadParticipationStore } from '../../../stores/useNotificationStore';
import type { NotificationItem } from '../../../utils/notifications';
import { useNotificationCapture } from './useNotificationCapture';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: jest.fn(),
            useSessionIdentity: jest.fn(),
            useUidInCloud: jest.fn(),
        },
        connection: { useCloudVerified: jest.fn() },
        sync: { registerSyncTarget: jest.fn() },
        data: { getCloudRepositories: jest.fn() },
    },
}));

jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

const cacheRead = jest.fn();
const getChat = jest.fn();

let data: ActiveCloudData;
const Wrapper = ({ children }: { children: ReactNode }) => (
    <ActiveCloudDataContext.Provider value={data}>{children}</ActiveCloudDataContext.Provider>
);

const chat = (overrides: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: 'ch1:10',
        channelId: 'ch1',
        chatNo: 10,
        ownerId: 'other',
        owner$: { id: 'other', name: 'Ann' },
        content: 'hello',
        stereo: '',
        createdAt: 5000,
        ...overrides,
    }) as unknown as DomainChat;

const channel = (overrides: Partial<DomainChannel> = {}): DomainChannel =>
    ({
        id: 'ch1',
        cid: 'c1',
        sid: 'p1',
        stereo: 'public',
        name: '#general',
        chatNo: 1,
        lastChat$: chat({ id: 'ch1:1', chatNo: 1 }),
        $join: { userId: 'member-me', chatNo: 1 },
        ...overrides,
    }) as unknown as DomainChannel;

/**
 * Starts capture on `room` (its first record is the baseline), then delivers each message as the
 * room's record moving ahead to it, letting the async lookups settle in between.
 */
const deliver = async (
    messages: DomainChat[],
    { room = channel(), joins = new Map<string, DomainJoin>() } = {}
): Promise<void> => {
    data = { channels: [room], isLoaded: true, myJoins: joins, unreads: {} as never };
    const hook = renderHook(() => useNotificationCapture(), { wrapper: Wrapper });
    for (const message of messages) {
        data = {
            ...data,
            channels: [{ ...room, chatNo: message.chatNo, lastChat$: message } as unknown as DomainChannel],
        };
        hook.rerender();
        await act(async () => {
            for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
        });
    }
};

const items = (): NotificationItem[] => Object.values(useNotificationStore.getState().items);

beforeEach(() => {
    jest.clearAllMocks();
    useNotificationStore.setState({ items: {} });
    useThreadParticipationStore.setState({ threads: {} });
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: 'c1', selectedSiteId: 'p1' });
    (runtime.session.useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
    (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me-in-cloud');
    (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
    (runtime.sync.registerSyncTarget as jest.Mock).mockReturnValue(jest.fn());
    (runtime.data.getCloudRepositories as jest.Mock).mockReturnValue({ chat: { cacheRead, getChat } });
    cacheRead.mockResolvedValue(null);
    getChat.mockResolvedValue(null);
});

describe('useNotificationCapture — top-level messages', () => {
    it('captures a message that mentions me as a mention, snapshotted with its room', async () => {
        await deliver([chat({ mention$: { userIds: ['member-me'] } })]);
        expect(items()).toEqual([
            {
                id: 'c1:ch1:10',
                cloudId: 'c1',
                placeId: 'p1',
                channelId: 'ch1',
                channelName: 'general',
                chatNo: 10,
                parentId: undefined,
                kind: 'mention',
                ownerId: 'other',
                ownerName: 'Ann',
                content: 'hello',
                quote: undefined,
                createdAt: 5000,
                read: false,
            },
        ]);
    });

    it('leaves out an ordinary group message', async () => {
        await deliver([chat()]);
        expect(items()).toEqual([]);
    });

    it('captures a 1:1 message, and a 1:1 mention as a mention', async () => {
        const dm = channel({ stereo: 'dm', name: '' });
        await deliver([chat(), chat({ id: 'ch1:11', chatNo: 11, mention$: { all: true } })], { room: dm });
        expect(items().map(item => [item.kind, item.inDm])).toEqual([
            ['dmMessage', true],
            ['mention', true],
        ]);
    });

    it('leaves out my own messages, by any id I am known by', async () => {
        await deliver([
            chat({ ownerId: 'member-me', owner$: { id: 'member-me' }, mention$: { all: true } } as Partial<DomainChat>),
            chat({ id: 'ch1:11', chatNo: 11, ownerId: 'me', owner$: undefined, mention$: { all: true } }),
        ]);
        expect(items()).toEqual([]);
    });

    it('leaves out a message at or below the read cursor', async () => {
        const room = channel({ $join: { userId: 'member-me', chatNo: 10 } } as Partial<DomainChannel>);
        await deliver([chat({ mention$: { all: true } })], { room });
        expect(items()).toEqual([]);
    });

    it('reads the cursor from my join row when it is further along', async () => {
        const joins = new Map([['ch1', { userId: 'member-me', chatNo: 10 } as unknown as DomainJoin]]);
        await deliver([chat({ mention$: { all: true } })], { joins });
        expect(items()).toEqual([]);
    });

    it('leaves out join and leave events', async () => {
        await deliver([chat({ stereo: 'system', mention$: { all: true } } as Partial<DomainChat>)]);
        expect(items()).toEqual([]);
    });

    it('keeps only mentions in a room whose notifications are off', async () => {
        const dm = channel({ stereo: 'dm' });
        const joins = new Map([['ch1', { userId: 'member-me', chatNo: 1, notify: 'none' } as unknown as DomainJoin]]);
        await deliver([chat(), chat({ id: 'ch1:11', chatNo: 11, mention$: { all: true } })], { room: dm, joins });
        expect(items().map(item => item.kind)).toEqual(['mention']);
    });
});

describe('useNotificationCapture — thread replies', () => {
    const reply = (overrides: Partial<DomainChat> = {}) => chat({ parentId: '5', ...overrides });
    const root = (ownerId: string) =>
        chat({ id: 'ch1:5', chatNo: 5, ownerId, owner$: { id: ownerId, name: 'X' }, content: 'the root' });

    it('files a reply in a thread whose root is mine as a reply to mine, quoting the root', async () => {
        cacheRead.mockResolvedValue(root('member-me'));
        await deliver([reply()]);
        expect(items()).toEqual([
            expect.objectContaining({ kind: 'replyToMine', parentId: '5', quote: 'the root', content: 'hello' }),
        ]);
        expect(cacheRead).toHaveBeenCalledWith('ch1:5');
        expect(getChat).not.toHaveBeenCalled();
    });

    it('reads a known thread from its record, not from the root again', async () => {
        cacheRead.mockResolvedValue(root('member-me'));
        await deliver([reply(), reply({ id: 'ch1:11', chatNo: 11 })]);
        expect(items().map(item => item.kind)).toEqual(['replyToMine', 'replyToMine']);
        expect(cacheRead).toHaveBeenCalledTimes(1);
    });

    it('files a reply in a thread I replied in as a participated thread, reading the root from the server when uncached', async () => {
        getChat.mockResolvedValue(root('someone'));
        await deliver([
            reply({
                id: 'ch1:10',
                chatNo: 10,
                ownerId: 'member-me',
                owner$: { id: 'member-me' },
            } as Partial<DomainChat>),
            reply({ id: 'ch1:11', chatNo: 11 }),
        ]);
        expect(items()).toEqual([
            expect.objectContaining({ id: 'c1:ch1:11', kind: 'participatedThread', quote: 'the root' }),
        ]);
        expect(getChat).toHaveBeenCalledWith({ id: 'ch1:5' });
    });

    it('leaves out a reply in someone else’s thread, and reads that thread’s root once', async () => {
        cacheRead.mockResolvedValue(root('someone'));
        await deliver([reply(), reply({ id: 'ch1:11', chatNo: 11 })]);
        expect(items()).toEqual([]);
        expect(cacheRead).toHaveBeenCalledTimes(1);
    });

    it('files a reply that mentions me as a thread mention without reading the root', async () => {
        await deliver([reply({ mention$: { userIds: ['me'] } })]);
        expect(items().map(item => [item.kind, item.parentId, item.quote])).toEqual([
            ['threadMention', '5', undefined],
        ]);
        expect(cacheRead).not.toHaveBeenCalled();
    });

    it('files a reply in a 1:1 thread with no other reason as a 1:1 message', async () => {
        cacheRead.mockResolvedValue(root('other'));
        await deliver([reply()], { room: channel({ stereo: 'dm' }) });
        expect(items().map(item => item.kind)).toEqual(['dmMessage']);
    });

    it('reads no root in a room down to mentions', async () => {
        const joins = new Map([
            ['ch1', { userId: 'member-me', chatNo: 1, notify: 'mention' } as unknown as DomainJoin],
        ]);
        await deliver([reply()], { joins });
        expect(items()).toEqual([]);
        expect(cacheRead).not.toHaveBeenCalled();
    });
});

describe('useNotificationCapture — reactions', () => {
    const reaction = (overrides: Partial<DomainChat> = {}) =>
        chat({
            id: 'ch1:12',
            chatNo: 12,
            stereo: 'system',
            subType: 'reaction',
            content: '',
            reaction$: { action: 'on', emoji: '👍', chatId: 'ch1:4' },
            ...overrides,
        } as Partial<DomainChat>);
    const target = (ownerId: string) =>
        chat({
            id: 'ch1:4',
            chatNo: 4,
            ownerId,
            owner$: { id: ownerId },
            content: 'my message',
        } as Partial<DomainChat>);

    it('captures a reaction to my message, keyed by target, emoji and person', async () => {
        cacheRead.mockResolvedValue(target('member-me'));
        await deliver([reaction()]);
        expect(items()).toEqual([
            expect.objectContaining({
                id: 'c1:reaction:ch1:4:👍:other',
                kind: 'reaction',
                emoji: '👍',
                content: '👍',
                quote: 'my message',
                chatNo: 12,
                targetChatNo: 4,
            }),
        ]);
    });

    it('reads the target from the cache only, and leaves an uncached one out', async () => {
        await deliver([reaction()]);
        expect(items()).toEqual([]);
        expect(cacheRead).toHaveBeenCalledWith('ch1:4');
        expect(getChat).not.toHaveBeenCalled();
    });

    it('leaves out a reaction to someone else’s message, and a reaction taken back', async () => {
        cacheRead.mockResolvedValue(target('someone'));
        await deliver([reaction()]);
        cacheRead.mockResolvedValue(target('member-me'));
        await deliver([
            reaction({ reaction$: { action: 'off', emoji: '👍', chatId: 'ch1:4' } } as Partial<DomainChat>),
        ]);
        expect(items()).toEqual([]);
    });
});

describe('useNotificationCapture — scope', () => {
    it('captures nothing from a room in another place', async () => {
        await deliver([chat({ mention$: { all: true } })], { room: channel({ sid: 'p2' }) });
        expect(items()).toEqual([]);
    });
});
