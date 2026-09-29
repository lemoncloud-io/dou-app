import { act, render } from '@testing-library/react';

import { OtherCloudUnreadProvider } from './OtherCloudUnreadProvider';
import { useOtherCloudUnread, type OtherCloudUnread } from './useOtherCloudUnread';

/**
 * The cache, partitioned the way the real one is: by cloud AND the uid the account has there. Each
 * observer is answered at once with what its partition holds, and again whenever the test writes.
 */
type Row = Record<string, unknown>;
type Scope = { cid?: string; uid?: string };
type Listener = { key: string; query: Row | undefined; emit: (result: { list: Row[] }) => void };

const partitions = {
    channel: new Map<string, Row[]>(),
    site: new Map<string, Row[]>(),
    join: new Map<string, Row[]>(),
};
const listeners = { channel: [] as Listener[], site: [] as Listener[], join: [] as Listener[] };
const keyOf = (scope: Scope) => `${scope.cid}|${scope.uid}`;

const readFor = (type: keyof typeof partitions, key: string, query: Row | undefined): Row[] => {
    const rows = partitions[type].get(key) ?? [];
    return type === 'join' ? rows.filter(row => row.channelId === query?.channelId) : rows;
};

const observe =
    (type: keyof typeof partitions) =>
    (query: Row | undefined, callback: (result: { list: Row[] }) => void, scope: Scope) => {
        const listener: Listener = { key: keyOf(scope), query, emit: callback };
        listeners[type].push(listener);
        callback({ list: readFor(type, listener.key, query) });
        return () => {
            listeners[type] = listeners[type].filter(entry => entry !== listener);
        };
    };

const write = (type: keyof typeof partitions, cid: string, uid: string, rows: Row[]) => {
    partitions[type].set(`${cid}|${uid}`, rows);
    for (const listener of listeners[type]) {
        if (listener.key === `${cid}|${uid}`) listener.emit({ list: readFor(type, listener.key, listener.query) });
    }
};

let mockSelected = 'cloud_1';
let mockUids: Record<string, string | null> = {};
let mockOwned: { id?: string }[] = [];
const uidSubscribers = new Set<() => void>();

jest.mock('@chatic/app-runtime', () => {
    const { useSyncExternalStore } = jest.requireActual('react');
    // One graph for the whole run, as the real one is: the observers' effects are keyed on it. The
    // calls go through lazily because this factory is hoisted above the fake cache it reads.
    const repositories = {
        channel: { observeList: (...args: Parameters<ReturnType<typeof observe>>) => observe('channel')(...args) },
        place: { observeList: (...args: Parameters<ReturnType<typeof observe>>) => observe('site')(...args) },
        join: { observeList: (...args: Parameters<ReturnType<typeof observe>>) => observe('join')(...args) },
    };
    return {
        runtime: {
            session: {
                useSessionSelection: () => ({ selectedCloudId: mockSelected }),
                useUidInCloud: (cid: string) =>
                    useSyncExternalStore(
                        (listener: () => void) => {
                            uidSubscribers.add(listener);
                            return () => uidSubscribers.delete(listener);
                        },
                        () => mockUids[cid] ?? null
                    ),
            },
            data: {
                useRuntimeRepositories: () => repositories,
            },
        },
    };
});
jest.mock('./useCloudCatalog', () => ({ useCloudSessionCatalog: () => ({ clouds: mockOwned }) }));
jest.mock('./useInvitedClouds', () => ({ useInvitedClouds: () => ({ invitedClouds: [] }) }));

const channel = (id: string, sid: string, fields: Row = {}): Row => ({ id, sid, cid: '', ...fields });

let seen: OtherCloudUnread = { byCloud: {}, total: 0 };
const Probe = () => {
    seen = useOtherCloudUnread();
    return null;
};
const renderProvider = () =>
    render(
        <OtherCloudUnreadProvider>
            <Probe />
        </OtherCloudUnreadProvider>
    );

beforeEach(() => {
    for (const type of ['channel', 'site', 'join'] as const) {
        partitions[type].clear();
        listeners[type] = [];
    }
    mockSelected = 'cloud_1';
    mockOwned = [{ id: 'cloud_1' }, { id: 'cloud_2' }];
    mockUids = { default: 'uid-relay', cloud_1: 'uid-1', cloud_2: 'uid-2' };
    seen = { byCloud: {}, total: 0 };
});

/** Cloud 2's rows, under the uid the account has THERE. */
const seedCloud2 = (rows: Row[], joins: Row[] = []) => {
    partitions.channel.set(
        'cloud_2|uid-2',
        rows.map(row => ({ ...row, cid: 'cloud_2' }))
    );
    partitions.site.set('cloud_2|uid-2', [{ id: 'site-a' }]);
    partitions.join.set('cloud_2|uid-2', joins);
};

describe('OtherCloudUnreadProvider', () => {
    it('counts an inactive cloud from its own partition, under the uid the account has there', () => {
        seedCloud2(
            [channel('ch1', 'site-a', { chatNo: 10, metaNo: 0 })],
            [{ channelId: 'ch1', userId: 'uid-2', chatNo: 6 }]
        );
        // The same cloud's rows under the ACTIVE cloud's uid are some other partition entirely.
        partitions.channel.set('cloud_2|uid-1', [channel('ch9', 'site-a', { cid: 'cloud_2', chatNo: 50 })]);

        renderProvider();

        expect(seen).toEqual({ byCloud: { cloud_2: 4 }, total: 4 });
    });

    it('never counts the cloud on screen', () => {
        partitions.channel.set('cloud_1|uid-1', [
            channel('ch1', 'site-a', { cid: 'cloud_1', chatNo: 9, $join: { chatNo: 1 } }),
        ]);

        renderProvider();

        expect(seen.byCloud).toEqual({});
    });

    it("reads a cursor from the channel's embedded $join when no join row is cached — the delta's only cursor", () => {
        seedCloud2([channel('ch1', 'site-a', { chatNo: 12, $join: { channelId: 'ch1', chatNo: 9 } })]);

        renderProvider();

        expect(seen.byCloud).toEqual({ cloud_2: 3 });
    });

    it('follows a delta landing in the background, with nothing asking it to', () => {
        seedCloud2([channel('ch1', 'site-a', { chatNo: 5, $join: { chatNo: 5 } })]);
        renderProvider();
        expect(seen.total).toBe(0);

        act(() => {
            write('channel', 'cloud_2', 'uid-2', [
                channel('ch1', 'site-a', { cid: 'cloud_2', chatNo: 8, $join: { chatNo: 5 } }),
            ]);
        });
        expect(seen).toEqual({ byCloud: { cloud_2: 3 }, total: 3 });

        // Read on another device: the next delta carries the moved $join, and the count goes.
        act(() => {
            write('channel', 'cloud_2', 'uid-2', [
                channel('ch1', 'site-a', { cid: 'cloud_2', chatNo: 8, $join: { chatNo: 8 } }),
            ]);
        });
        expect(seen).toEqual({ byCloud: {}, total: 0 });
    });

    it('leaves out a cloud the account has no uid in yet, and counts it once one arrives', () => {
        seedCloud2([channel('ch1', 'site-a', { chatNo: 4, $join: { chatNo: 1 } })]);
        mockUids.cloud_2 = null;
        renderProvider();
        expect(seen.byCloud).toEqual({});

        act(() => {
            mockUids.cloud_2 = 'uid-2';
            for (const listener of uidSubscribers) listener();
        });

        expect(seen.byCloud).toEqual({ cloud_2: 3 });
    });

    it('does not count a room whose place the cloud no longer has', () => {
        seedCloud2([
            channel('ch1', 'site-a', { chatNo: 4, $join: { chatNo: 1 } }),
            channel('ch2', 'site-gone', { chatNo: 9, $join: { chatNo: 1 } }),
        ]);

        renderProvider();

        expect(seen.byCloud).toEqual({ cloud_2: 3 });
    });

    it('drops a cloud the moment it becomes the one on screen, and counts the one the user left', () => {
        seedCloud2([channel('ch1', 'site-a', { chatNo: 4, $join: { chatNo: 1 } })]);
        partitions.channel.set('cloud_1|uid-1', [
            channel('ch5', 'site-b', { cid: 'cloud_1', chatNo: 7, $join: { chatNo: 5 } }),
        ]);
        partitions.site.set('cloud_1|uid-1', [{ id: 'site-b' }]);
        const view = renderProvider();
        expect(seen.byCloud).toEqual({ cloud_2: 3 });

        mockSelected = 'cloud_2';
        view.rerender(
            <OtherCloudUnreadProvider>
                <Probe />
            </OtherCloudUnreadProvider>
        );

        expect(seen).toEqual({ byCloud: { cloud_1: 2 }, total: 2 });
    });
});
