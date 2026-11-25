import type { runtime } from '@chatic/runtime-react';

import {
    assertWritableRow,
    CACHE_DOMAINS,
    cacheDomain,
    clearDomain,
    deleteDomainRow,
    loadDomainRows,
    rowKey,
    TEMPLATES,
    writeDomainRow,
} from './cacheDomains';

type PageRepositories = runtime.data.PageRepositories;

const repo = (list: unknown[] = []) => ({
    cacheReadList: jest.fn(async (_query?: unknown): Promise<{ list: unknown[] } | null> => ({ list })),
    cacheWrite: jest.fn(async () => undefined),
    cacheDelete: jest.fn(async () => undefined),
    cacheClear: jest.fn(async () => undefined),
});

const graph = (overrides: Record<string, ReturnType<typeof repo>> = {}) => {
    const repos = {
        channel: repo([{ id: 'ch1' }, { id: 'ch2' }]),
        chat: repo(),
        user: repo([{ id: 'u1' }]),
        join: repo(),
        place: repo([{ id: 'p1' }]),
        cloud: repo(),
        profile: repo(),
        invite: repo(),
        ...overrides,
    };
    return { repos, graph: repos as unknown as PageRepositories };
};

describe('CACHE_DOMAINS', () => {
    it('maps the renamed domains to the cache types the router decides by', () => {
        expect(cacheDomain('place')).toMatchObject({ cacheType: 'site', repository: 'place' });
        expect(cacheDomain('cloud')).toMatchObject({ cacheType: 'invitecloud', repository: 'cloud' });
    });

    it('has a starter template with a fresh id for every domain', () => {
        for (const { key } of CACHE_DOMAINS) {
            const a = TEMPLATES[key]();
            expect(a.id).toMatch(new RegExp(`^dbg-${key}-`));
            expect(TEMPLATES[key]().id).not.toBe(a.id);
        }
    });
});

describe('loadDomainRows', () => {
    it('reads a scope-wide domain in one call', async () => {
        const { repos, graph: g } = graph();

        await expect(loadDomainRows(g, cacheDomain('place'))).resolves.toEqual({ rows: [{ id: 'p1' }], failures: [] });
        expect(repos.place.cacheReadList).toHaveBeenCalledTimes(1);
    });

    it('filters users by channel only when a channel is picked', async () => {
        const { repos, graph: g } = graph();

        await loadDomainRows(g, cacheDomain('user'));
        await loadDomainRows(g, cacheDomain('user'), { channelId: 'ch1' });

        expect(repos.user.cacheReadList.mock.calls).toEqual([[{}], [{ channelId: 'ch1' }]]);
    });

    it('walks every cached channel for a per-channel domain, capping chat rows per channel', async () => {
        const chat = repo();
        chat.cacheReadList.mockImplementation(async (query: unknown) => ({
            list: [{ id: `m-${(query as { channelId: string }).channelId}` }],
        }));
        const { graph: g } = graph({ chat });

        const result = await loadDomainRows(g, cacheDomain('chat'), { perChannelLimit: 5 });

        expect(chat.cacheReadList.mock.calls).toEqual([
            [{ channelId: 'ch1', limit: 5 }],
            [{ channelId: 'ch2', limit: 5 }],
        ]);
        expect(result.rows).toEqual([{ id: 'm-ch1' }, { id: 'm-ch2' }]);
    });

    it('reads only the picked channel, and lists a failing channel without dropping the others', async () => {
        const join = repo();
        join.cacheReadList.mockImplementation(async (query: unknown) => {
            if ((query as { channelId: string }).channelId === 'ch1') throw new Error('bridge timeout');
            return { list: [{ id: 'j2' }] };
        });
        const { graph: g } = graph({ join });

        await expect(loadDomainRows(g, cacheDomain('join'))).resolves.toEqual({
            rows: [{ id: 'j2' }],
            failures: [{ channelId: 'ch1', message: 'bridge timeout' }],
        });
        await loadDomainRows(g, cacheDomain('join'), { channelId: 'ch2' });
        expect(join.cacheReadList).toHaveBeenLastCalledWith({ channelId: 'ch2' });
    });

    it('answers an empty list for a repository that returns null', async () => {
        const invite = repo();
        invite.cacheReadList.mockResolvedValue(null as never);
        const { graph: g } = graph({ invite });

        await expect(loadDomainRows(g, cacheDomain('invite'))).resolves.toEqual({ rows: [], failures: [] });
    });
});

describe('writes', () => {
    it('writes, deletes and clears through the domain repository', async () => {
        const { repos, graph: g } = graph();
        const place = cacheDomain('place');

        await writeDomainRow(g, place, { id: 'p1', name: 'x' });
        await deleteDomainRow(g, place, 'p1');
        await clearDomain(g, place);

        expect(repos.place.cacheWrite).toHaveBeenCalledWith({ id: 'p1', name: 'x' });
        expect(repos.place.cacheDelete).toHaveBeenCalledWith('p1');
        expect(repos.place.cacheClear).toHaveBeenCalled();
    });

    it('accepts only an object with a non-empty string id', () => {
        expect(assertWritableRow({ id: 'a', n: 1 })).toEqual({ id: 'a', n: 1 });
        expect(() => assertWritableRow([])).toThrow('a row is a JSON object');
        expect(() => assertWritableRow({ id: '' })).toThrow('non-empty string "id"');
        expect(() => assertWritableRow({ id: 3 })).toThrow('non-empty string "id"');
    });

    it('keys a row by channel and id so a user listed under two channels stays two rows', () => {
        expect(rowKey({ id: 'u1', channelId: 'c1' }, 0)).not.toBe(rowKey({ id: 'u1', channelId: 'c2' }, 1));
    });
});
