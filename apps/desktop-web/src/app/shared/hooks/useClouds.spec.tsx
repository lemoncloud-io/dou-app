import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

// Invited clouds are not in the relay catalog and their durable record is the local `invitecloud`
// cache row — the joined-clouds store is a per-profile localStorage twin. Reading only that twin
// hid every invited cloud joined on another profile, including the one the session was inside.
let catalogClouds: Array<Record<string, unknown>> = [];
let cachedClouds: Array<Record<string, unknown>> = [];
let joinedClouds: Record<string, { id: string; name?: string }> = {};
let activeCloudId = '';
let catalogFailed = false;
const refetchClouds = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                cloud: {
                    observeList: (callback: (result: { list: unknown[] } | null) => void) => {
                        callback({ list: cachedClouds });
                        return () => undefined;
                    },
                },
            }),
        },
        session: {
            useGlobalSession: () => ({ cloud: { cloudId: activeCloudId } }),
        },
    },
}));

// The catalog hook lives in this folder, not in the runtime: ADR-0070 moved it
// down so each app owns the read's cache policy. Mocking it on `@chatic/app-runtime`
// left the real one running against a mock that has no `useSessionAuth`.
vi.mock('./useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({
        clouds: catalogClouds,
        isFetchingClouds: false,
        isCloudsError: catalogFailed,
        refetchClouds,
    }),
}));

vi.mock('../stores', () => ({
    useJoinedCloudsStore: (selector: (state: { joinedClouds: typeof joinedClouds }) => unknown) =>
        selector({ joinedClouds }),
}));

import i18n from '../../../i18n';
import { canCreatePlace, useClouds, type RailCloud } from './useClouds';

describe('canCreatePlace', () => {
    const clouds: RailCloud[] = [
        { id: 'default', name: 'Home', status: 'active', kind: 'home' },
        { id: 'mine', name: 'Studio', status: 'active', kind: 'owned' },
        { id: 'lapsed', name: 'Archive', status: 'expired', kind: 'owned' },
        { id: 'blocked', name: 'Old', status: 'suspended', kind: 'owned' },
        { id: 'joined', name: 'Friends', status: 'active', kind: 'invited' },
    ];

    const allowed = { isGuest: false, isCloudActive: true };

    it('offers a new place inside a cloud the account owns and can open', () => {
        expect(canCreatePlace(clouds, 'mine', allowed)).toBe(true);
    });

    it.each(['default', 'joined', 'lapsed', 'blocked', 'unknown', null])('does not offer one in %s', activeCloudId => {
        expect(canCreatePlace(clouds, activeCloudId, allowed)).toBe(false);
    });

    it('does not offer one to a guest account', () => {
        expect(canCreatePlace(clouds, 'mine', { ...allowed, isGuest: true })).toBe(false);
    });

    it('does not offer one while the session is not active in a cloud', () => {
        expect(canCreatePlace(clouds, 'mine', { ...allowed, isCloudActive: false })).toBe(false);
    });
});

describe('useClouds', () => {
    beforeEach(() => {
        catalogClouds = [];
        cachedClouds = [];
        joinedClouds = {};
        activeCloudId = '';
        catalogFailed = false;
    });

    // `isCloudsError` had no reader: a failed catalog read dropped every owned cloud from the rail unannounced.
    it('reports a failed catalog read and hands over the retry', () => {
        catalogFailed = true;

        const { result } = renderHook(() => useClouds());

        expect(result.current.isCloudsError).toBe(true);
        expect(result.current.refetchClouds).toBe(refetchClouds);
    });

    it('shows an invited cloud held only in the local cache', () => {
        cachedClouds = [{ id: '1000001', cid: '1000001', name: '넹미', cloudType: 'invited' }];

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds.map(c => c.id)).toEqual(['default', '1000001']);
        expect(result.current.clouds[1]).toMatchObject({ name: '넹미', kind: 'invited' });
    });

    it('names an owned tile from the cloud cache when it holds a newer name than the catalog', () => {
        catalogClouds = [{ id: '1000004', name: 'Old name', status: 'active' }];
        cachedClouds = [{ id: '1000004', cid: '1000004', name: 'New name', cloudType: 'owner' }];

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds[1]).toMatchObject({ id: '1000004', name: 'New name', kind: 'owned' });
    });

    it('keeps the catalog name of an owned tile when the cache row has none', () => {
        catalogClouds = [{ id: '1000004', name: 'Catalog name', status: 'active' }];
        cachedClouds = [{ id: '1000004', cid: '1000004', cloudType: 'owner' }];

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds[1]).toMatchObject({ name: 'Catalog name', kind: 'owned' });
    });

    it('falls back to the catalog name when the cached name is an empty string', () => {
        catalogClouds = [{ id: '1000004', name: 'Catalog name', status: 'active' }];
        cachedClouds = [{ id: '1000004', cid: '1000004', name: '', cloudType: 'owner' }];

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds[1]).toMatchObject({ name: 'Catalog name', kind: 'owned' });
    });

    it('does not rename another cloud with the cached name of a different one', () => {
        catalogClouds = [
            { id: 'a', name: 'A', status: 'active' },
            { id: 'b', name: 'B', status: 'active' },
        ];
        cachedClouds = [{ id: 'b', cid: 'b', name: 'B renamed', cloudType: 'owner' }];

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds.map(c => c.name)).toEqual([expect.any(String), 'A', 'B renamed']);
    });

    it('keeps the owned entry when the same cloud is also cached as invited', () => {
        catalogClouds = [{ id: '1000004', name: 'Owned', status: 'active' }];
        cachedClouds = [{ id: '1000004', cid: '1000004', cloudType: 'invited' }];

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds.map(c => c.kind)).toEqual(['home', 'owned']);
    });

    it('names a cached invited cloud from the joined-clouds store', () => {
        // The invite-accept flow writes id/cid/backend/wss to the cache but no name; the store has it.
        cachedClouds = [{ id: '1000001', cid: '1000001', cloudType: 'invited' }];
        joinedClouds = { '1000001': { id: '1000001', name: '넹미' } };

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds.map(c => c.id)).toEqual(['default', '1000001']);
        expect(result.current.clouds[1].name).toBe('넹미');
    });

    it('gives the cloud the session is inside a tile even when no source lists it', () => {
        activeCloudId = '1000001';

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds.map(c => c.id)).toEqual(['default', '1000001']);
        expect(result.current.activeCloudId).toBe('1000001');
    });

    // The tile read "Home" in a Korean UI: the name was a literal, not a string of the UI.
    it('names the Home tile in the UI language', async () => {
        await i18n.changeLanguage('ko');
        const { result } = renderHook(() => useClouds());
        expect(result.current.clouds[0]).toMatchObject({ id: 'default', name: '홈', kind: 'home' });
        await i18n.changeLanguage('en');
    });
});
