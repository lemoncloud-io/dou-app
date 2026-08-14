import type { CacheModelMap, CacheQueryMap } from '@chatic/app-messages';
import type { ILogService } from '../log';
import type { ICacheDataSource } from '../../data/cache';
import { CacheCrudService } from './CacheCrudService';

type AnyDataSource = ICacheDataSource<CacheModelMap[keyof CacheModelMap], CacheQueryMap[keyof CacheModelMap]>;

const makeDataSourceMock = (): jest.Mocked<AnyDataSource> =>
    ({
        fetch: jest.fn(),
        fetchMany: jest.fn(),
        fetchAll: jest.fn(),
        save: jest.fn(),
        saveAll: jest.fn(),
        remove: jest.fn(),
        removeAll: jest.fn(),
        clear: jest.fn(),
    }) as any;

const makeLoggerMock = (): ILogService =>
    ({
        subscribe: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }) as any;

const setup = () => {
    const chat = makeDataSourceMock();
    const channel = makeDataSourceMock();
    const join = makeDataSourceMock();
    const site = makeDataSourceMock();
    const user = makeDataSourceMock();
    const inviteCloud = makeDataSourceMock();
    const profile = makeDataSourceMock();
    const meta = makeDataSourceMock();
    const invite = makeDataSourceMock();
    // Constructor order must match provider.ts wiring; profile, meta, invite are the last args.
    const service = new CacheCrudService(
        makeLoggerMock(),
        chat,
        channel,
        join,
        site,
        user,
        inviteCloud,
        profile,
        meta,
        invite
    );
    return { service, profile, meta, user, invite };
};

describe('CacheCrudService — profile/meta 라우팅', () => {
    it('fetch(profile)는 profileDataSource.fetch로 위임하고 결과를 반환해야 한다', async () => {
        const { service, profile } = setup();
        const item = { id: 's1@u1' } as CacheModelMap['profile'];
        profile.fetch.mockResolvedValueOnce(item);

        const result = await service.fetch({ type: 'profile', id: 's1@u1', cid: 'c1', uid: 'u1' });

        expect(result).toBe(item);
        expect(profile.fetch).toHaveBeenCalledWith('s1@u1', 'c1', 'u1');
    });

    it('fetchAll(profile)는 profileDataSource.fetchAll로 위임해야 한다', async () => {
        const { service, profile } = setup();
        profile.fetchAll.mockResolvedValueOnce([]);

        await service.fetchAll({ type: 'profile', query: { sid: 's1' }, cid: 'c1', uid: 'u1' });

        expect(profile.fetchAll).toHaveBeenCalledWith('c1', { sid: 's1' }, 'u1');
    });

    it('save(profile)는 profileDataSource.save로 위임해야 한다', async () => {
        const { service, profile } = setup();
        const item = { id: 's1@u1' } as CacheModelMap['profile'];

        await service.save({ type: 'profile', id: 's1@u1', item, cid: 'c1', uid: 'u1' });

        expect(profile.save).toHaveBeenCalledWith('s1@u1', item, 'c1', 'u1');
    });

    it('saveAll(profile)는 id/data로 포맷하여 profileDataSource.saveAll로 위임해야 한다', async () => {
        const { service, profile } = setup();
        const items = [{ id: 's1@u1' }, { id: 's1@u2' }] as CacheModelMap['profile'][];

        await service.saveAll({ type: 'profile', items, cid: 'c1', uid: 'u1' });

        expect(profile.saveAll).toHaveBeenCalledWith(
            [
                { id: 's1@u1', data: items[0] },
                { id: 's1@u2', data: items[1] },
            ],
            'c1',
            'u1'
        );
    });

    it('delete/deleteAll(profile)는 profileDataSource.remove/removeAll로 위임해야 한다', async () => {
        const { service, profile } = setup();

        await service.delete({ type: 'profile', id: 's1@u1', cid: 'c1', uid: 'u1' });
        await service.deleteAll({ type: 'profile', ids: ['s1@u1', 's1@u2'], cid: 'c1', uid: 'u1' });

        expect(profile.remove).toHaveBeenCalledWith('s1@u1', 'c1', 'u1');
        expect(profile.removeAll).toHaveBeenCalledWith(['s1@u1', 's1@u2'], 'c1', 'u1');
    });

    it('clear(profile)는 profileDataSource.clear로 위임해야 한다', async () => {
        const { service, profile } = setup();

        await service.clear({ type: 'profile', cid: 'c1', uid: 'u1' });

        expect(profile.clear).toHaveBeenCalledWith('c1', 'u1');
    });

    it('fetch/save(meta)는 metaDataSource로 위임해야 한다', async () => {
        const { service, meta } = setup();
        const item = { id: 'channel-sync', cid: 'c1', uid: 'u1', syncedAt: 5 } as CacheModelMap['meta'];
        meta.fetch.mockResolvedValueOnce(item);

        const fetched = await service.fetch({ type: 'meta', id: 'channel-sync', cid: 'c1', uid: 'u1' });
        await service.save({ type: 'meta', id: 'channel-sync', item, cid: 'c1', uid: 'u1' });

        expect(fetched).toBe(item);
        expect(meta.fetch).toHaveBeenCalledWith('channel-sync', 'c1', 'u1');
        expect(meta.save).toHaveBeenCalledWith('channel-sync', item, 'c1', 'u1');
    });

    it('fetch/save(invite)는 inviteDataSource로 위임해야 한다', async () => {
        const { service, invite } = setup();
        const item = { id: 'i1', cid: 'default', uid: 'u1', state: 'pending' } as CacheModelMap['invite'];
        invite.fetch.mockResolvedValueOnce(item);

        const fetched = await service.fetch({ type: 'invite', id: 'i1', cid: 'default', uid: 'u1' });
        await service.save({ type: 'invite', id: 'i1', item, cid: 'default', uid: 'u1' });

        expect(fetched).toBe(item);
        expect(invite.fetch).toHaveBeenCalledWith('i1', 'default', 'u1');
        expect(invite.save).toHaveBeenCalledWith('i1', item, 'default', 'u1');
    });

    it('알 수 없는 타입은 default로 떨어져 null을 반환하고 어떤 소스도 건드리지 않아야 한다', async () => {
        const { service, profile, meta, user, invite } = setup();

        // Cast an unregistered type to exercise the defensive default branch.
        const result = await service.fetch({ type: 'bogus' as any, id: 'x', cid: 'c1', uid: 'u1' });

        expect(result).toBeNull();
        expect(profile.fetch).not.toHaveBeenCalled();
        expect(meta.fetch).not.toHaveBeenCalled();
        expect(user.fetch).not.toHaveBeenCalled();
        expect(invite.fetch).not.toHaveBeenCalled();
    });
});

describe('CacheCrudService — fetchMany', () => {
    it('데이터 소스가 fetchMany를 구현하면 그걸로 한 번에 위임한다', async () => {
        const { service, profile } = setup();
        const items = [{ id: 's1@u1' }, { id: 's1@u2' }] as CacheModelMap['profile'][];
        profile.fetchMany!.mockResolvedValueOnce(items);

        const result = await service.fetchMany({ type: 'profile', ids: ['s1@u1', 's1@u2'], cid: 'c1', uid: 'u1' });

        expect(result).toBe(items);
        expect(profile.fetchMany).toHaveBeenCalledWith(['s1@u1', 's1@u2'], 'c1', 'u1');
        expect(profile.fetch).not.toHaveBeenCalled();
    });

    it('fetchMany 미구현이면 fetch 반복으로 채운다 — 브릿지 왕복은 여전히 1회다', async () => {
        const { service, profile } = setup();
        // 선택 구현이므로 없는 상태를 만든다.
        (profile as any).fetchMany = undefined;
        profile.fetch.mockResolvedValueOnce({ id: 's1@u1' } as CacheModelMap['profile']).mockResolvedValueOnce(null);

        const result = await service.fetchMany({ type: 'profile', ids: ['s1@u1', 'missing'], cid: 'c1', uid: 'u1' });

        // 없는 id는 자리를 비워두지 않고 빠진다.
        expect(result).toEqual([{ id: 's1@u1' }]);
        expect(profile.fetch).toHaveBeenCalledTimes(2);
    });

    it('빈 ids는 데이터 소스를 건드리지 않는다', async () => {
        const { service, profile } = setup();

        await expect(service.fetchMany({ type: 'profile', ids: [], cid: 'c1', uid: 'u1' })).resolves.toEqual([]);
        expect(profile.fetchMany).not.toHaveBeenCalled();
        expect(profile.fetch).not.toHaveBeenCalled();
    });

    it('알 수 없는 타입은 던지지 않고 빈 배열로 답한다 (웹이 앱보다 먼저 배포되므로)', async () => {
        const { service } = setup();

        await expect(service.fetchMany({ type: 'nope' as any, ids: ['x'] })).resolves.toEqual([]);
    });

    it('데이터 소스가 던지면 빈 배열로 답하고 기록한다', async () => {
        const { service, profile } = setup();
        profile.fetchMany!.mockRejectedValueOnce(new Error('sqlite exploded'));

        await expect(service.fetchMany({ type: 'profile', ids: ['s1@u1'] })).resolves.toEqual([]);
    });
});
