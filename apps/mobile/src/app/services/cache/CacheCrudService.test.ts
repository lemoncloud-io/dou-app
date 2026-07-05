import type { CacheModelMap, CacheQueryMap } from '@chatic/app-messages';
import type { ILogService } from '../log';
import type { ICacheDataSource } from '../../data/cache';
import { CacheCrudService } from './CacheCrudService';

type AnyDataSource = ICacheDataSource<CacheModelMap[keyof CacheModelMap], CacheQueryMap[keyof CacheModelMap]>;

const makeDataSourceMock = (): jest.Mocked<AnyDataSource> =>
    ({
        fetch: jest.fn(),
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
    // Constructor order must match provider.ts wiring; profile then meta are the last args.
    const service = new CacheCrudService(makeLoggerMock(), chat, channel, join, site, user, inviteCloud, profile, meta);
    return { service, profile, meta, user };
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

    it('알 수 없는 타입은 default로 떨어져 null을 반환하고 어떤 소스도 건드리지 않아야 한다', async () => {
        const { service, profile, meta, user } = setup();

        // Cast an unregistered type to exercise the defensive default branch.
        const result = await service.fetch({ type: 'bogus' as any, id: 'x', cid: 'c1', uid: 'u1' });

        expect(result).toBeNull();
        expect(profile.fetch).not.toHaveBeenCalled();
        expect(meta.fetch).not.toHaveBeenCalled();
        expect(user.fetch).not.toHaveBeenCalled();
    });
});
