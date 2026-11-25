import { act, renderHook } from '@testing-library/react';

import { runtime, type DomainChannel, type DomainLastChat } from '@chatic/runtime-react';

import { readLastNos, useChatSyncRegistration } from './useChatSyncRegistration';

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        sync: {
            registerSyncTarget: jest.fn(),
            updateSyncSnapshot: jest.fn(),
        },
        session: {
            useSessionSelection: jest.fn(),
            getGlobalSessionContext: jest.fn(),
            useUidInCloud: jest.fn(),
        },
        data: {
            useRuntimeRepositories: jest.fn(),
            getCloudRepositories: jest.fn(),
        },
        connection: {
            useRuntimeSocketState: jest.fn(),
            useCloudVerified: jest.fn(),
        },
    })
);

interface Subscription {
    ids: string[];
    emit: (rows: DomainLastChat[]) => void;
    unsubscribe: jest.Mock;
}

const registerChat = jest.fn();
const updateSyncSnapshot = jest.fn();
const newestFeed = jest.fn();
const olderRefreshList = jest.fn();
let subscriptions: Subscription[] = [];
const observeLastList = jest.fn((ids: string[], cb: (rows: DomainLastChat[]) => void) => {
    const unsubscribe = jest.fn();
    subscriptions.push({ ids, emit: cb, unsubscribe });
    return unsubscribe;
});

const select = (cid: string) => {
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: cid });
    (runtime.session.getGlobalSessionContext as jest.Mock).mockReturnValue({ cloud: { cloudId: cid } });
};

const channel = (id: string, chatNo = 0): DomainChannel => ({ id, chatNo }) as unknown as DomainChannel;
const row = (channelId: string, lastNo: number): DomainLastChat => ({ channelId, lastNo, chat: null, activity: null });

const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 0)));

const answer = async (rows: DomainLastChat[]) => {
    const open = subscriptions[subscriptions.length - 1];
    open.emit(rows);
    await settle();
};

beforeEach(() => {
    jest.clearAllMocks();
    subscriptions = [];
    newestFeed.mockResolvedValue({ fetchedCount: 0, cursorNo: 0 });
    olderRefreshList.mockResolvedValue({ fetchedCount: 0, cursorNo: 0 });
    registerChat.mockReturnValue(jest.fn());
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ chat: { observeLastList } });
    const refreshList = (query: { cursorNo?: number }, options?: unknown) =>
        query.cursorNo === undefined ? newestFeed(query) : olderRefreshList(query, options);
    (runtime.data.getCloudRepositories as jest.Mock).mockReturnValue({ chat: { refreshList } });
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
    select('cloud-a');
    (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me');
    (runtime.sync.registerSyncTarget as jest.Mock).mockImplementation((...args: unknown[]) => registerChat(...args));
    (runtime.sync.updateSyncSnapshot as jest.Mock).mockImplementation((...args: unknown[]) =>
        updateSyncSnapshot(...args)
    );
});

describe('readLastNos', () => {
    it('answers with the first reading and closes the subscription', async () => {
        const reading = readLastNos({ observeLastList }, ['c1', 'c2']);
        subscriptions[0].emit([row('c1', 4)]);

        await expect(reading).resolves.toEqual(new Map([['c1', 4]]));
        expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('closes a subscription that answered before it returned', async () => {
        const unsubscribe = jest.fn();
        const eager = jest.fn((_ids: string[], cb: (rows: DomainLastChat[]) => void) => {
            cb([row('c1', 9)]);
            return unsubscribe;
        });

        await expect(readLastNos({ observeLastList: eager }, ['c1'])).resolves.toEqual(new Map([['c1', 9]]));
        await Promise.resolve();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});

describe('useChatSyncRegistration', () => {
    it('registers a chat target for every channel', () => {
        renderHook(() => useChatSyncRegistration([channel('c1'), channel('c2')]));

        expect(registerChat).toHaveBeenCalledWith({ type: 'chat', id: 'c1' }, { cid: 'cloud-a' });
        expect(registerChat).toHaveBeenCalledWith({ type: 'chat', id: 'c2' }, { cid: 'cloud-a' });
    });

    it('drops every registration on unmount', () => {
        const dispose = jest.fn();
        registerChat.mockReturnValue(dispose);

        const { unmount } = renderHook(() => useChatSyncRegistration([channel('c1'), channel('c2')]));
        unmount();

        expect(dispose).toHaveBeenCalledTimes(2);
    });

    it('neither re-registers nor reads again when only the order changes', () => {
        const { rerender } = renderHook(({ channels }) => useChatSyncRegistration(channels), {
            initialProps: { channels: [channel('c1'), channel('c2')] },
        });
        rerender({ channels: [channel('c2'), channel('c1')] });

        expect(registerChat).toHaveBeenCalledTimes(2);
        expect(observeLastList).toHaveBeenCalledTimes(1);
    });

    it('does nothing before the socket is verified', () => {
        (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(false);

        renderHook(() => useChatSyncRegistration([channel('c1')]));

        expect(registerChat).not.toHaveBeenCalled();
        expect(observeLastList).not.toHaveBeenCalled();
    });

    it('aligns the plan baseline from one reading, for the channels the cache holds', async () => {
        renderHook(() => useChatSyncRegistration([channel('c1'), channel('c2')]));

        await answer([row('c1', 12)]);

        expect(updateSyncSnapshot).toHaveBeenCalledTimes(1);
        expect(updateSyncSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'c1' },
            { id: 'c1', lastNo: 12 },
            { cid: 'cloud-a' }
        );
    });

    it('closes the reading, so a later chat write wakes nothing', async () => {
        renderHook(() => useChatSyncRegistration([channel('c1', 7)]));
        await answer([row('c1', 4)]);

        expect(subscriptions[0].unsubscribe).toHaveBeenCalled();
        subscriptions[0].emit([row('c1', 4)]);
        await settle();

        expect(observeLastList).toHaveBeenCalledTimes(1);
        expect(newestFeed).toHaveBeenCalledTimes(1);
    });

    it('fetches a newest page of 30, only for channels whose head is ahead', async () => {
        renderHook(() => useChatSyncRegistration([channel('c1', 7), channel('c2', 3)]));

        await answer([row('c1', 4), row('c2', 3)]);

        expect(newestFeed).toHaveBeenCalledTimes(1);
        expect(newestFeed).toHaveBeenCalledWith({ channelId: 'c1', limit: 30 });
    });

    it('does not walk a room the cache holds nothing of', async () => {
        newestFeed.mockResolvedValue({ fetchedCount: 20, cursorNo: 181 });
        renderHook(() => useChatSyncRegistration([channel('c1', 200)]));

        await answer([]);

        expect(newestFeed).toHaveBeenCalledWith({ channelId: 'c1', limit: 30 });
        expect(olderRefreshList).not.toHaveBeenCalled();
    });

    it('reads again only the room whose head moved', async () => {
        const { rerender } = renderHook(({ channels }) => useChatSyncRegistration(channels), {
            initialProps: { channels: [channel('c1', 4), channel('c2', 3)] },
        });
        await answer([row('c1', 4), row('c2', 3)]);

        rerender({ channels: [channel('c1', 5), channel('c2', 3)] });
        await answer([row('c1', 4)]);

        expect(subscriptions[1].ids).toEqual(['c1']);
        expect(newestFeed).toHaveBeenCalledWith({ channelId: 'c1', limit: 30 });
    });

    it('walks one head once', async () => {
        const { rerender } = renderHook(({ channels }) => useChatSyncRegistration(channels), {
            initialProps: { channels: [channel('c1', 7)] },
        });
        await answer([row('c1', 4)]);

        rerender({ channels: [channel('c1', 7)] });
        await settle();

        expect(newestFeed).toHaveBeenCalledTimes(1);
    });

    it('pages older through the cloud repositories until the pages meet the newest cached row', async () => {
        newestFeed.mockResolvedValue({ fetchedCount: 20, cursorNo: 181 });
        olderRefreshList
            .mockResolvedValueOnce({ fetchedCount: 50, cursorNo: 131 })
            .mockResolvedValueOnce({ fetchedCount: 50, cursorNo: 81 });
        renderHook(() => useChatSyncRegistration([channel('c1', 200)]));

        await answer([row('c1', 100)]);

        expect(runtime.data.getCloudRepositories).toHaveBeenCalledWith('cloud-a');
        expect(olderRefreshList.mock.calls).toEqual([
            [{ channelId: 'c1', cursorNo: 181, limit: 50 }, { cursorIsRow: true }],
            [{ channelId: 'c1', cursorNo: 131, limit: 50 }, { cursorIsRow: true }],
        ]);
    });

    it('stops paging older once the selection moves to another cloud', async () => {
        let answerNewest: (page: { fetchedCount: number; cursorNo: number }) => void = () => undefined;
        newestFeed.mockImplementationOnce(() => new Promise(resolve => (answerNewest = resolve)));
        renderHook(() => useChatSyncRegistration([channel('c1', 200)]));
        await answer([row('c1', 100)]);

        select('cloud-b');
        await act(async () => answerNewest({ fetchedCount: 20, cursorNo: 181 }));
        await settle();

        expect(olderRefreshList).not.toHaveBeenCalled();
    });

    it('stops paging older once the account in the cloud changes', async () => {
        let answerNewest: (page: { fetchedCount: number; cursorNo: number }) => void = () => undefined;
        newestFeed.mockImplementationOnce(() => new Promise(resolve => (answerNewest = resolve)));
        const { rerender } = renderHook(() => useChatSyncRegistration([channel('c1', 200)]));
        await answer([row('c1', 100)]);

        (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('someone-else');
        rerender();
        await act(async () => answerNewest({ fetchedCount: 20, cursorNo: 181 }));
        await settle();

        expect(olderRefreshList).not.toHaveBeenCalled();
    });

    it("waits for the selected cloud's own slot before registering", () => {
        renderHook(() => useChatSyncRegistration([channel('c1')]));

        expect(runtime.connection.useCloudVerified).toHaveBeenCalledWith('cloud-a');
    });

    it('re-registers when the uid in the cloud changes', () => {
        const { rerender } = renderHook(() => useChatSyncRegistration([channel('c1')]));

        (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('someone-else');
        rerender();

        expect(registerChat).toHaveBeenCalledTimes(2);
    });

    it('re-registers and reads again under the next cloud after a switch', async () => {
        const { rerender } = renderHook(() => useChatSyncRegistration([channel('c1')]));
        await answer([row('c1', 3)]);

        select('cloud-b');
        rerender();

        expect(registerChat).toHaveBeenLastCalledWith({ type: 'chat', id: 'c1' }, { cid: 'cloud-b' });
        expect(observeLastList).toHaveBeenCalledTimes(2);
    });

    it('drops a reading that answers after the selection moved, and reads again in the next cloud', async () => {
        const { rerender } = renderHook(({ channels }) => useChatSyncRegistration(channels), {
            initialProps: { channels: [channel('a1', 5)] },
        });

        select('cloud-b');
        await answer([row('a1', 5)]);
        expect(updateSyncSnapshot).not.toHaveBeenCalled();
        expect(newestFeed).not.toHaveBeenCalled();

        rerender({ channels: [channel('b1', 3)] });
        await answer([row('b1', 1)]);

        expect(updateSyncSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'b1' },
            { id: 'b1', lastNo: 1 },
            { cid: 'cloud-b' }
        );
        expect(newestFeed).toHaveBeenCalledWith({ channelId: 'b1', limit: 30 });
    });
});
