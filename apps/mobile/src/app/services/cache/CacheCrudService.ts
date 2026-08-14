import type { CacheModelMap, CacheQueryMap, CacheType, PagingMeta } from '@chatic/app-messages';
import type { ICacheCrudService } from './types';
import type { ILogService } from '../log';
import type { ICacheDataSource } from '../../data/cache';

/**
 * CacheTypes this app can actually persist — the `switch` arms below, as data.
 *
 * Reported to the web in the bridge handshake (`useBaseBridge`) because the web deploys ahead of
 * the app: a web build that knows a NEW CacheType would otherwise send it here, fall into the
 * `default` arm, and get `null` back with `success: true` — a permanently empty cache, not an error.
 * Keep this list in sync with the arms; adding a type here without a data source makes the web
 * trust a store that drops writes.
 */
export const SUPPORTED_CACHE_TYPES: readonly CacheType[] = [
    'chat',
    'channel',
    'join',
    'site',
    'user',
    'invitecloud',
    'profile',
    'meta',
    'invite',
];

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
    private readonly profileDataSource: ICacheDataSource<CacheModelMap['profile'], CacheQueryMap['profile']>;
    private readonly metaDataSource: ICacheDataSource<CacheModelMap['meta'], CacheQueryMap['meta']>;
    private readonly inviteDataSource: ICacheDataSource<CacheModelMap['invite'], CacheQueryMap['invite']>;

    constructor(
        logService: ILogService,
        chatDataSource: ICacheDataSource<CacheModelMap['chat'], CacheQueryMap['chat']>,
        channelDataSource: ICacheDataSource<CacheModelMap['channel'], CacheQueryMap['channel']>,
        joinDataSource: ICacheDataSource<CacheModelMap['join'], CacheQueryMap['join']>,
        siteDataSource: ICacheDataSource<CacheModelMap['site'], CacheQueryMap['site']>,
        userDataSource: ICacheDataSource<CacheModelMap['user'], CacheQueryMap['user']>,
        inviteCloudDataSource: ICacheDataSource<CacheModelMap['invitecloud'], CacheQueryMap['invitecloud']>,
        // Appended last so existing positional call sites stay valid.
        profileDataSource: ICacheDataSource<CacheModelMap['profile'], CacheQueryMap['profile']>,
        metaDataSource: ICacheDataSource<CacheModelMap['meta'], CacheQueryMap['meta']>,
        inviteDataSource: ICacheDataSource<CacheModelMap['invite'], CacheQueryMap['invite']>
    ) {
        this.logService = logService;
        this.chatDataSource = chatDataSource;
        this.channelDataSource = channelDataSource;
        this.joinDataSource = joinDataSource;
        this.siteDataSource = siteDataSource;
        this.userDataSource = userDataSource;
        this.inviteCloudDataSource = inviteCloudDataSource;
        this.profileDataSource = profileDataSource;
        this.metaDataSource = metaDataSource;
        this.inviteDataSource = inviteDataSource;
    }

    /**
     * 타입 → 데이터 소스. `fetchMany`만 이걸 씁니다.
     *
     * 다른 연산이 switch를 펼쳐 쓰는 건 도메인마다 인자 순서와 형태가 다르기 때문인데(`fetchAll`은
     * (cid, query, uid), `save`는 (id, item, cid, uid)), `fetchMany`는 모든 도메인이 (ids, cid, uid)로
     * 같아서 분기가 데이터 소스 선택 하나뿐입니다. 여기서 unsupported를 `null`로 답하는 규칙도
     * 기존 `default` arm과 같습니다 — 웹이 앱보다 먼저 배포되므로 모르는 타입이 도착할 수 있고,
     * 그때 던지면 브릿지 에러가 되어 웹의 폴백 판단을 어렵게 만듭니다.
     */
    private getDataSource<K extends CacheType>(type: K): ICacheDataSource<CacheModelMap[K], CacheQueryMap[K]> | null {
        switch (type) {
            case 'chat':
                return this.chatDataSource as never;
            case 'channel':
                return this.channelDataSource as never;
            case 'join':
                return this.joinDataSource as never;
            case 'site':
                return this.siteDataSource as never;
            case 'user':
                return this.userDataSource as never;
            case 'invitecloud':
                return this.inviteCloudDataSource as never;
            case 'profile':
                return this.profileDataSource as never;
            case 'meta':
                return this.metaDataSource as never;
            case 'invite':
                return this.inviteDataSource as never;
            default:
                return null;
        }
    }

    public async fetchMany<K extends CacheType>(payload: {
        type: K;
        ids: string[];
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K][]> {
        const { type, ids, cid, uid } = payload;
        if (!ids || ids.length === 0) return [];

        try {
            const dataSource = this.getDataSource(type);
            if (!dataSource) return [];

            // `fetchMany`는 선택 구현입니다. 없으면 `fetch`를 반복합니다 — 이래도 브릿지 왕복은
            // 여전히 1회이므로 목적(왕복 접기)은 달성됩니다. 느려지는 건 인프로세스 SQLite 쿼리
            // 횟수뿐이고, 그건 왕복 앞에서 무시할 수준입니다.
            if (dataSource.fetchMany) {
                return await dataSource.fetchMany(ids, cid, uid);
            }

            const items: Array<CacheModelMap[K] | null> = await Promise.all(
                ids.map(id => dataSource.fetch(id, cid, uid))
            );
            return items.filter((item): item is CacheModelMap[K] => !!item);
        } catch (error) {
            this.logService.error('CACHE', `FetchMany error for type: ${type}`, error as Error);
            return [];
        }
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
                case 'profile':
                    return (await this.profileDataSource.fetch(id, cid, uid)) as CacheModelMap[K] | null;
                case 'meta':
                    return (await this.metaDataSource.fetch(id, cid, uid)) as CacheModelMap[K] | null;
                case 'invite':
                    return (await this.inviteDataSource.fetch(id, cid, uid)) as CacheModelMap[K] | null;
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
                case 'profile':
                    return (await this.profileDataSource.fetchAll(
                        cid,
                        query as CacheQueryMap['profile'],
                        uid
                    )) as CacheModelMap[K][];
                case 'meta':
                    return (await this.metaDataSource.fetchAll(
                        cid,
                        query as CacheQueryMap['meta'],
                        uid
                    )) as CacheModelMap[K][];
                case 'invite':
                    return (await this.inviteDataSource.fetchAll(
                        cid,
                        query as CacheQueryMap['invite'],
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
                case 'profile':
                    await this.profileDataSource.save(id, item as CacheModelMap['profile'], cid, uid);
                    break;
                case 'meta':
                    await this.metaDataSource.save(id, item as CacheModelMap['meta'], cid, uid);
                    break;
                case 'invite':
                    await this.inviteDataSource.save(id, item as CacheModelMap['invite'], cid, uid);
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
                case 'profile':
                    await this.profileDataSource.saveAll(formatItems(items as CacheModelMap['profile'][]), cid, uid);
                    break;
                case 'meta':
                    await this.metaDataSource.saveAll(formatItems(items as CacheModelMap['meta'][]), cid, uid);
                    break;
                case 'invite':
                    await this.inviteDataSource.saveAll(formatItems(items as CacheModelMap['invite'][]), cid, uid);
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
                case 'profile':
                    await this.profileDataSource.remove(id, cid, uid);
                    break;
                case 'meta':
                    await this.metaDataSource.remove(id, cid, uid);
                    break;
                case 'invite':
                    await this.inviteDataSource.remove(id, cid, uid);
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
                case 'profile':
                    await this.profileDataSource.removeAll(ids, cid, uid);
                    break;
                case 'meta':
                    await this.metaDataSource.removeAll(ids, cid, uid);
                    break;
                case 'invite':
                    await this.inviteDataSource.removeAll(ids, cid, uid);
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
                case 'profile':
                    await this.profileDataSource.clear(cid, uid);
                    break;
                case 'meta':
                    await this.metaDataSource.clear(cid, uid);
                    break;
                case 'invite':
                    await this.inviteDataSource.clear(cid, uid);
                    break;
            }
        } catch (error) {
            this.logService.error('CACHE', `Clear error for type: ${payload.type}`, error as Error);
        }
    }
}
