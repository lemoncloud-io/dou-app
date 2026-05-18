import type { CacheModelMap, CacheQueryMap, CacheType, PagingMeta } from '@chatic/app-messages';
import type { ICacheCrudService } from './types';
import type { ILogService } from '../log';
import type { ICacheDataSource, MetaDataSource } from '../../data/cache';

const generateMetaKey = (query: any): string => {
    if (!query) return 'default';
    return JSON.stringify(query);
};

const resolveScopedUid = (type: CacheType, uid?: string): string =>
    type === 'invitecloud' ? 'global' : (uid ?? 'default');

const resolveScopedCid = (type: CacheType, cid?: string): string =>
    type === 'invitecloud' ? 'global' : (cid ?? 'default');

/**
 * 쿼리 객체에 페이징을 유발하는 파라미터가 있는지 검사합니다.
 */
const isPaginatedQuery = (query?: any): boolean => {
    if (!query) return false;
    return query.limit !== undefined || query.page !== undefined || query.cursorNo !== undefined;
};

export class CacheCrudService implements ICacheCrudService {
    private readonly logService: ILogService;
    private readonly chatDataSource: ICacheDataSource<CacheModelMap['chat'], CacheQueryMap['chat']>;
    private readonly channelDataSource: ICacheDataSource<CacheModelMap['channel'], CacheQueryMap['channel']>;
    private readonly joinDataSource: ICacheDataSource<CacheModelMap['join'], CacheQueryMap['join']>;
    private readonly siteDataSource: ICacheDataSource<CacheModelMap['site'], CacheQueryMap['site']>;
    private readonly userDataSource: ICacheDataSource<CacheModelMap['user'], CacheQueryMap['user']>;
    private readonly inviteCloudDataSource: ICacheDataSource<
        CacheModelMap['invitecloud'],
        CacheQueryMap['invitecloud']
    >;
    private readonly metaDataSource: MetaDataSource;

    constructor(
        logService: ILogService,
        chatDataSource: ICacheDataSource<CacheModelMap['chat'], CacheQueryMap['chat']>,
        channelDataSource: ICacheDataSource<CacheModelMap['channel'], CacheQueryMap['channel']>,
        joinDataSource: ICacheDataSource<CacheModelMap['join'], CacheQueryMap['join']>,
        siteDataSource: ICacheDataSource<CacheModelMap['site'], CacheQueryMap['site']>,
        userDataSource: ICacheDataSource<CacheModelMap['user'], CacheQueryMap['user']>,
        inviteCloudDataSource: ICacheDataSource<CacheModelMap['invitecloud'], CacheQueryMap['invitecloud']>,
        metaDataSource: MetaDataSource
    ) {
        this.logService = logService;
        this.chatDataSource = chatDataSource;
        this.channelDataSource = channelDataSource;
        this.joinDataSource = joinDataSource;
        this.siteDataSource = siteDataSource;
        this.userDataSource = userDataSource;
        this.inviteCloudDataSource = inviteCloudDataSource;
        this.metaDataSource = metaDataSource;
    }

    public async fetch<K extends CacheType>(payload: {
        type: K;
        id: string;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K] | null> {
        const { type, id, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(type, cid);

        try {
            switch (type) {
                case 'chat':
                    return (await this.chatDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
                case 'channel':
                    return (await this.channelDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
                case 'join':
                    return (await this.joinDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
                case 'site':
                    return (await this.siteDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
                case 'user':
                    return (await this.userDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
                case 'invitecloud':
                    return (await this.inviteCloudDataSource.fetch(id, scopedCid, scopedUid)) as
                        | CacheModelMap[K]
                        | null;
                default:
                    return null;
            }
        } catch (error) {
            this.logService.error('CACHE', `Fetch error for type: ${type}, id: ${id}`, error as Error);
            return null;
        }
    }

    public async fetchAll<K extends CacheType>(payload: {
        type: K;
        query?: CacheQueryMap[K] & PagingMeta;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K][]> {
        const { type, query, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(type, cid);

        try {
            // 페이징 파라미터가 존재하는 경우에만 메타데이터(스냅샷) 매칭을 수행합니다.
            if (cid && query && isPaginatedQuery(query)) {
                const metaKey = generateMetaKey(query);
                const cachedMeta = await this.metaDataSource.fetch(type, cid, scopedUid, metaKey);

                if (cachedMeta && cachedMeta.ids && cachedMeta.ids.length > 0) {
                    const snapshotItems = await Promise.all(
                        cachedMeta.ids.map(id => this.fetch({ type, id, cid, uid: scopedUid }))
                    );
                    return snapshotItems.filter(Boolean) as CacheModelMap[K][];
                }
            }

            // 페이징이 없거나 스냅샷이 없는 경우, 항상 최신 로컬 DB 상태를 쿼리합니다.
            switch (type) {
                case 'chat':
                    return (await this.chatDataSource.fetchAll(
                        scopedCid,
                        query as CacheQueryMap['chat'],
                        scopedUid
                    )) as CacheModelMap[K][];
                case 'channel':
                    return (await this.channelDataSource.fetchAll(
                        scopedCid,
                        query as CacheQueryMap['channel'],
                        scopedUid
                    )) as CacheModelMap[K][];
                case 'join':
                    return (await this.joinDataSource.fetchAll(
                        scopedCid,
                        query as CacheQueryMap['join'],
                        scopedUid
                    )) as CacheModelMap[K][];
                case 'site':
                    return (await this.siteDataSource.fetchAll(
                        scopedCid,
                        query as CacheQueryMap['site'],
                        scopedUid
                    )) as CacheModelMap[K][];
                case 'user':
                    return (await this.userDataSource.fetchAll(
                        scopedCid,
                        query as CacheQueryMap['user'],
                        scopedUid
                    )) as CacheModelMap[K][];
                case 'invitecloud':
                    return (await this.inviteCloudDataSource.fetchAll(
                        scopedCid,
                        query as CacheQueryMap['invitecloud'],
                        scopedUid
                    )) as CacheModelMap[K][];
                default:
                    return [];
            }
        } catch (error) {
            this.logService.error('CACHE', `FetchAll error for type: ${type}`, error as Error);
            return [];
        }
    }

    public async save<K extends CacheType>(payload: {
        type: K;
        id: string;
        item: CacheModelMap[K];
        cid: string;
        uid: string;
    }): Promise<string> {
        const { type, id, item, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(type, cid);

        try {
            switch (type) {
                case 'chat':
                    await this.chatDataSource.save(id, item as CacheModelMap['chat'], scopedCid, scopedUid);
                    break;
                case 'channel':
                    await this.channelDataSource.save(id, item as CacheModelMap['channel'], scopedCid, scopedUid);
                    break;
                case 'join':
                    await this.joinDataSource.save(id, item as CacheModelMap['join'], scopedCid, scopedUid);
                    break;
                case 'site':
                    await this.siteDataSource.save(id, item as CacheModelMap['site'], scopedCid, scopedUid);
                    break;
                case 'user':
                    await this.userDataSource.save(id, item as CacheModelMap['user'], scopedCid, scopedUid);
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.save(
                        id,
                        item as CacheModelMap['invitecloud'],
                        scopedCid,
                        scopedUid
                    );
                    break;
            }
        } catch (error) {
            this.logService.error('CACHE', `Save error for type: ${type}, id: ${id}`, error as Error);
        }
        return id;
    }

    public async saveAll<K extends CacheType>(payload: {
        type: K;
        items: CacheModelMap[K][];
        cid: string;
        uid: string;
        query?: CacheQueryMap[K] & PagingMeta;
    }): Promise<string[]> {
        const { type, items, cid, uid, query } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(type, cid);

        const formatItems = <T extends { id?: string }>(dataList: T[]) =>
            dataList.map(item => ({ id: item.id || 'unknown', data: item }));

        try {
            switch (type) {
                case 'chat':
                    await this.chatDataSource.saveAll(
                        formatItems(items as CacheModelMap['chat'][]),
                        scopedCid,
                        scopedUid
                    );
                    break;
                case 'channel':
                    await this.channelDataSource.saveAll(
                        formatItems(items as CacheModelMap['channel'][]),
                        scopedCid,
                        scopedUid
                    );
                    break;
                case 'join':
                    await this.joinDataSource.saveAll(
                        formatItems(items as CacheModelMap['join'][]),
                        scopedCid,
                        scopedUid
                    );
                    break;
                case 'site':
                    await this.siteDataSource.saveAll(
                        formatItems(items as CacheModelMap['site'][]),
                        scopedCid,
                        scopedUid
                    );
                    break;
                case 'user':
                    await this.userDataSource.saveAll(
                        formatItems(items as CacheModelMap['user'][]),
                        scopedCid,
                        scopedUid
                    );
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.saveAll(
                        formatItems(items as CacheModelMap['invitecloud'][]),
                        scopedCid,
                        scopedUid
                    );
                    break;
            }

            const ids = items.map((i: any) => i.id);

            if (query && ids.length > 0 && isPaginatedQuery(query)) {
                const metaKey = generateMetaKey(query);
                await this.metaDataSource.save(type, cid, scopedUid, metaKey, {
                    ids,
                    uid: scopedUid,
                });
            }

            return ids;
        } catch (error) {
            this.logService.error('CACHE', `SaveAll error for type: ${type}`, error as Error);
            return [];
        }
    }

    public async delete<K extends CacheType>(payload: {
        type: K;
        id: string;
        cid: string;
        uid: string;
    }): Promise<string> {
        const { type, id, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        try {
            switch (type) {
                case 'chat':
                    await this.chatDataSource.remove(id, cid, scopedUid);
                    break;
                case 'channel':
                    await this.channelDataSource.remove(id, cid, scopedUid);
                    break;
                case 'join':
                    await this.joinDataSource.remove(id, cid, scopedUid);
                    break;
                case 'site':
                    await this.siteDataSource.remove(id, cid, scopedUid);
                    break;
                case 'user':
                    await this.userDataSource.remove(id, cid, scopedUid);
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.remove(id, cid, scopedUid);
                    break;
            }
        } catch (error) {
            this.logService.error('CACHE', `Delete error for type: ${type}, id: ${id}`, error as Error);
        }
        return id;
    }

    public async deleteAll<K extends CacheType>(payload: {
        type: K;
        ids: string[];
        cid: string;
        uid: string;
    }): Promise<string[]> {
        const { type, ids, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(payload.type, payload.cid);

        try {
            switch (type) {
                case 'chat':
                    await this.chatDataSource.removeAll(ids, scopedCid, scopedUid);
                    break;
                case 'channel':
                    await this.channelDataSource.removeAll(ids, scopedCid, scopedUid);
                    break;
                case 'join':
                    await this.joinDataSource.removeAll(ids, scopedCid, scopedUid);
                    break;
                case 'site':
                    await this.siteDataSource.removeAll(ids, scopedCid, scopedUid);
                    break;
                case 'user':
                    await this.userDataSource.removeAll(ids, scopedCid, scopedUid);
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.removeAll(ids, scopedCid, scopedUid);
                    break;
            }
        } catch (error) {
            this.logService.error('CACHE', `DeleteAll error for type: ${type}`, error as Error);
        }
        return ids;
    }

    public async clear<K extends CacheType>(payload: { type: K; cid: string; uid: string }): Promise<void> {
        const scopedUid = resolveScopedUid(payload.type, payload.uid);
        const scopedCid = resolveScopedCid(payload.type, payload.cid);
        try {
            switch (payload.type) {
                case 'chat':
                    await this.chatDataSource.clear(scopedCid, scopedUid);
                    break;
                case 'channel':
                    await this.channelDataSource.clear(scopedCid, scopedUid);
                    break;
                case 'join':
                    await this.joinDataSource.clear(scopedCid, scopedUid);
                    break;
                case 'site':
                    await this.siteDataSource.clear(scopedCid, scopedUid);
                    break;
                case 'user':
                    await this.userDataSource.clear(scopedCid, scopedUid);
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.clear(scopedCid, scopedUid);
                    break;
            }
            await this.metaDataSource.clear(payload.type, scopedCid, scopedUid);
        } catch (error) {
            this.logService.error('CACHE', `Clear error for type: ${payload.type}`, error as Error);
        }
    }
}
