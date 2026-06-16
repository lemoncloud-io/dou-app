import type { CacheModelMap, CacheQueryMap, CacheType, PagingMeta } from '@chatic/app-messages';
import type { ICacheCrudService } from './types';
import type { ILogService } from '../log';
import type { ICacheDataSource } from '../../data/cache';

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

    constructor(
        logService: ILogService,
        chatDataSource: ICacheDataSource<CacheModelMap['chat'], CacheQueryMap['chat']>,
        channelDataSource: ICacheDataSource<CacheModelMap['channel'], CacheQueryMap['channel']>,
        joinDataSource: ICacheDataSource<CacheModelMap['join'], CacheQueryMap['join']>,
        siteDataSource: ICacheDataSource<CacheModelMap['site'], CacheQueryMap['site']>,
        userDataSource: ICacheDataSource<CacheModelMap['user'], CacheQueryMap['user']>,
        inviteCloudDataSource: ICacheDataSource<CacheModelMap['invitecloud'], CacheQueryMap['invitecloud']>
    ) {
        this.logService = logService;
        this.chatDataSource = chatDataSource;
        this.channelDataSource = channelDataSource;
        this.joinDataSource = joinDataSource;
        this.siteDataSource = siteDataSource;
        this.userDataSource = userDataSource;
        this.inviteCloudDataSource = inviteCloudDataSource;
    }

    public async fetch<K extends CacheType>(payload: {
        type: K;
        id: string;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K] | null> {
        const { type, id, cid, uid } = payload;

        try {
            switch (type) {
                case 'chat':
                    return (await this.chatDataSource.fetch(id, cid, uid)) as CacheModelMap[K] | null;
                case 'channel':
                    return (await this.channelDataSource.fetch(id, cid, uid)) as CacheModelMap[K] | null;
                case 'join':
                    return (await this.joinDataSource.fetch(id, cid, uid)) as CacheModelMap[K] | null;
                case 'site':
                    return (await this.siteDataSource.fetch(id, cid, uid)) as CacheModelMap[K] | null;
                case 'user':
                    return (await this.userDataSource.fetch(id, cid, uid)) as CacheModelMap[K] | null;
                case 'invitecloud':
                    return (await this.inviteCloudDataSource.fetch(id, cid, uid)) as CacheModelMap[K] | null;
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

        try {
            switch (type) {
                case 'chat':
                    return (await this.chatDataSource.fetchAll(
                        cid,
                        query as CacheQueryMap['chat'],
                        uid
                    )) as CacheModelMap[K][];
                case 'channel':
                    return (await this.channelDataSource.fetchAll(
                        cid,
                        query as CacheQueryMap['channel'],
                        uid
                    )) as CacheModelMap[K][];
                case 'join':
                    return (await this.joinDataSource.fetchAll(
                        cid,
                        query as CacheQueryMap['join'],
                        uid
                    )) as CacheModelMap[K][];
                case 'site':
                    return (await this.siteDataSource.fetchAll(
                        cid,
                        query as CacheQueryMap['site'],
                        uid
                    )) as CacheModelMap[K][];
                case 'user':
                    return (await this.userDataSource.fetchAll(
                        cid,
                        query as CacheQueryMap['user'],
                        uid
                    )) as CacheModelMap[K][];
                case 'invitecloud':
                    return (await this.inviteCloudDataSource.fetchAll(
                        cid,
                        query as CacheQueryMap['invitecloud'],
                        uid
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

        try {
            switch (type) {
                case 'chat':
                    await this.chatDataSource.save(id, item as CacheModelMap['chat'], cid, uid);
                    break;
                case 'channel':
                    await this.channelDataSource.save(id, item as CacheModelMap['channel'], cid, uid);
                    break;
                case 'join':
                    await this.joinDataSource.save(id, item as CacheModelMap['join'], cid, uid);
                    break;
                case 'site':
                    await this.siteDataSource.save(id, item as CacheModelMap['site'], cid, uid);
                    break;
                case 'user':
                    await this.userDataSource.save(id, item as CacheModelMap['user'], cid, uid);
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.save(id, item as CacheModelMap['invitecloud'], cid, uid);
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
        const { type, items, cid, uid } = payload;

        const formatItems = <T extends { id?: string }>(dataList: T[]) =>
            dataList.map(item => ({ id: item.id || 'unknown', data: item }));

        try {
            switch (type) {
                case 'chat':
                    await this.chatDataSource.saveAll(formatItems(items as CacheModelMap['chat'][]), cid, uid);
                    break;
                case 'channel':
                    await this.channelDataSource.saveAll(formatItems(items as CacheModelMap['channel'][]), cid, uid);
                    break;
                case 'join':
                    await this.joinDataSource.saveAll(formatItems(items as CacheModelMap['join'][]), cid, uid);
                    break;
                case 'site':
                    await this.siteDataSource.saveAll(formatItems(items as CacheModelMap['site'][]), cid, uid);
                    break;
                case 'user':
                    await this.userDataSource.saveAll(formatItems(items as CacheModelMap['user'][]), cid, uid);
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.saveAll(
                        formatItems(items as CacheModelMap['invitecloud'][]),
                        cid,
                        uid
                    );
                    break;
            }

            const ids = items.map((i: any) => i.id);
            // 메타테이블 저장 로직 제거 완료
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
        try {
            switch (type) {
                case 'chat':
                    await this.chatDataSource.remove(id, cid, uid);
                    break;
                case 'channel':
                    await this.channelDataSource.remove(id, cid, uid);
                    break;
                case 'join':
                    await this.joinDataSource.remove(id, cid, uid);
                    break;
                case 'site':
                    await this.siteDataSource.remove(id, cid, uid);
                    break;
                case 'user':
                    await this.userDataSource.remove(id, cid, uid);
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.remove(id, cid, uid);
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

        try {
            switch (type) {
                case 'chat':
                    await this.chatDataSource.removeAll(ids, cid, uid);
                    break;
                case 'channel':
                    await this.channelDataSource.removeAll(ids, cid, uid);
                    break;
                case 'join':
                    await this.joinDataSource.removeAll(ids, cid, uid);
                    break;
                case 'site':
                    await this.siteDataSource.removeAll(ids, cid, uid);
                    break;
                case 'user':
                    await this.userDataSource.removeAll(ids, cid, uid);
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.removeAll(ids, cid, uid);
                    break;
            }
        } catch (error) {
            this.logService.error('CACHE', `DeleteAll error for type: ${type}`, error as Error);
        }
        return ids;
    }

    public async clear<K extends CacheType>(payload: { type: K; cid?: string; uid?: string }): Promise<void> {
        try {
            const { type, cid, uid } = payload;
            switch (type) {
                case 'chat':
                    await this.chatDataSource.clear(cid, uid);
                    break;
                case 'channel':
                    await this.channelDataSource.clear(cid, uid);
                    break;
                case 'join':
                    await this.joinDataSource.clear(cid, uid);
                    break;
                case 'site':
                    await this.siteDataSource.clear(cid, uid);
                    break;
                case 'user':
                    await this.userDataSource.clear(cid, uid);
                    break;
                case 'invitecloud':
                    await this.inviteCloudDataSource.clear(cid, uid);
                    break;
            }
        } catch (error) {
            this.logService.error('CACHE', `Clear error for type: ${payload.type}`, error as Error);
        }
    }
}
