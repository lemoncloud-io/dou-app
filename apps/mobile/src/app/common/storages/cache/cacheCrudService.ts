import type { CacheModelMap, CacheQueryMap, CacheType, PagingMeta } from '@chatic/app-messages';
import {
    channelDataSource,
    chatDataSource,
    inviteCloudDataSource,
    joinDataSource,
    siteDataSource,
    userDataSource,
    metaDataSource,
} from './datasources';

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

export const cacheCrudService = {
    /**
     * [조회] 단건 캐시 데이터 조회
     */
    fetch: async <K extends CacheType>(payload: {
        type: K;
        id: string;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K] | null> => {
        const { type, id, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(type, cid);

        switch (type) {
            case 'chat':
                return (await chatDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
            case 'channel':
                return (await channelDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
            case 'join':
                return (await joinDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
            case 'site':
                return (await siteDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
            case 'user':
                return (await userDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
            case 'invitecloud':
                return (await inviteCloudDataSource.fetch(id, scopedCid, scopedUid)) as CacheModelMap[K] | null;
            default:
                return null;
        }
    },

    /**
     * [조회] 다수/페이징 캐시 조회
     */
    fetchAll: async <K extends CacheType>(payload: {
        type: K;
        query?: CacheQueryMap[K] & PagingMeta;
        cid?: string;
        uid?: string;
    }): Promise<CacheModelMap[K][]> => {
        const { type, query, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(type, cid);

        // 페이징 파라미터가 존재하는 경우에만 메타데이터(스냅샷) 매칭을 수행합니다.
        if (cid && query && isPaginatedQuery(query)) {
            const metaKey = generateMetaKey(query);
            const cachedMeta = await metaDataSource.fetch(type, cid, scopedUid, metaKey);

            if (cachedMeta && cachedMeta.ids && cachedMeta.ids.length > 0) {
                const snapshotItems = await Promise.all(
                    cachedMeta.ids.map(id => cacheCrudService.fetch({ type, id, cid, uid: scopedUid }))
                );
                return snapshotItems.filter(Boolean) as CacheModelMap[K][];
            }
        }

        // 페이징이 없거나 스냅샷이 없는 경우, 항상 최신 로컬 DB 상태를 쿼리합니다.
        switch (type) {
            case 'chat':
                return (await chatDataSource.fetchAll(
                    scopedCid,
                    query as CacheQueryMap['chat'],
                    scopedUid
                )) as CacheModelMap[K][];
            case 'channel':
                return (await channelDataSource.fetchAll(
                    scopedCid,
                    query as CacheQueryMap['channel'],
                    scopedUid
                )) as CacheModelMap[K][];
            case 'join':
                return (await joinDataSource.fetchAll(
                    scopedCid,
                    query as CacheQueryMap['join'],
                    scopedUid
                )) as CacheModelMap[K][];
            case 'site':
                return (await siteDataSource.fetchAll(
                    scopedCid,
                    query as CacheQueryMap['site'],
                    scopedUid
                )) as CacheModelMap[K][];
            case 'user':
                return (await userDataSource.fetchAll(
                    scopedCid,
                    query as CacheQueryMap['user'],
                    scopedUid
                )) as CacheModelMap[K][];
            case 'invitecloud':
                return (await inviteCloudDataSource.fetchAll(
                    scopedCid,
                    query as CacheQueryMap['invitecloud'],
                    scopedUid
                )) as CacheModelMap[K][];
            default:
                return [];
        }
    },

    /**
     * [저장] 단일 아이템 저장
     */
    save: async <K extends CacheType>(payload: {
        type: K;
        id: string;
        item: CacheModelMap[K];
        cid: string;
        uid: string;
    }): Promise<string> => {
        const { type, id, item, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(type, cid);

        switch (type) {
            case 'chat':
                await chatDataSource.save(id, item as CacheModelMap['chat'], scopedCid, scopedUid);
                break;
            case 'channel':
                await channelDataSource.save(id, item as CacheModelMap['channel'], scopedCid, scopedUid);
                break;
            case 'join':
                await joinDataSource.save(id, item as CacheModelMap['join'], scopedCid, scopedUid);
                break;
            case 'site':
                await siteDataSource.save(id, item as CacheModelMap['site'], scopedCid, scopedUid);
                break;
            case 'user':
                await userDataSource.save(id, item as CacheModelMap['user'], scopedCid, scopedUid);
                break;
            case 'invitecloud':
                await inviteCloudDataSource.save(id, item as CacheModelMap['invitecloud'], scopedCid, scopedUid);
                break;
        }
        return id;
    },

    /**
     * [저장] 다수 아이템 일괄 저장
     */
    saveAll: async <K extends CacheType>(payload: {
        type: K;
        items: CacheModelMap[K][];
        cid: string;
        uid: string;
        query?: CacheQueryMap[K] & PagingMeta;
    }): Promise<string[]> => {
        const { type, items, cid, uid, query } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(type, cid);

        const formatItems = <T extends { id?: string }>(dataList: T[]) =>
            dataList.map(item => ({ id: item.id || 'unknown', data: item }));

        switch (type) {
            case 'chat':
                await chatDataSource.saveAll(formatItems(items as CacheModelMap['chat'][]), scopedCid, scopedUid);
                break;
            case 'channel':
                await channelDataSource.saveAll(formatItems(items as CacheModelMap['channel'][]), scopedCid, scopedUid);
                break;
            case 'join':
                await joinDataSource.saveAll(formatItems(items as CacheModelMap['join'][]), scopedCid, scopedUid);
                break;
            case 'site':
                await siteDataSource.saveAll(formatItems(items as CacheModelMap['site'][]), scopedCid, scopedUid);
                break;
            case 'user':
                await userDataSource.saveAll(formatItems(items as CacheModelMap['user'][]), scopedCid, scopedUid);
                break;
            case 'invitecloud':
                await inviteCloudDataSource.saveAll(
                    formatItems(items as CacheModelMap['invitecloud'][]),
                    scopedCid,
                    scopedUid
                );
                break;
        }

        const ids = items.map((i: any) => i.id);

        if (query && ids.length > 0 && isPaginatedQuery(query)) {
            const metaKey = generateMetaKey(query);
            await metaDataSource.save(type, cid, scopedUid, metaKey, {
                ids,
                uid: scopedUid,
            });
        }

        return ids;
    },

    /**
     * [삭제] 단일 아이템 삭제
     */
    delete: async <K extends CacheType>(payload: {
        type: K;
        id: string;
        cid: string;
        uid: string;
    }): Promise<string> => {
        const { type, id, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        switch (type) {
            case 'chat':
                await chatDataSource.remove(id, cid, scopedUid);
                break;
            case 'channel':
                await channelDataSource.remove(id, cid, scopedUid);
                break;
            case 'join':
                await joinDataSource.remove(id, cid, scopedUid);
                break;
            case 'site':
                await siteDataSource.remove(id, cid, scopedUid);
                break;
            case 'user':
                await userDataSource.remove(id, cid, scopedUid);
                break;
            case 'invitecloud':
                await inviteCloudDataSource.remove(id, cid, scopedUid);
                break;
        }
        return id;
    },

    /**
     * [삭제] 다수 아이템 일괄 삭제
     */
    deleteAll: async <K extends CacheType>(payload: {
        type: K;
        ids: string[];
        cid: string;
        uid: string;
    }): Promise<string[]> => {
        const { type, ids, cid, uid } = payload;
        const scopedUid = resolveScopedUid(type, uid);
        const scopedCid = resolveScopedCid(payload.type, payload.cid);

        switch (type) {
            case 'chat':
                await chatDataSource.removeAll(ids, scopedCid, scopedUid);
                break;
            case 'channel':
                await channelDataSource.removeAll(ids, scopedCid, scopedUid);
                break;
            case 'join':
                await joinDataSource.removeAll(ids, scopedCid, scopedUid);
                break;
            case 'site':
                await siteDataSource.removeAll(ids, scopedCid, scopedUid);
                break;
            case 'user':
                await userDataSource.removeAll(ids, scopedCid, scopedUid);
                break;
            case 'invitecloud':
                await inviteCloudDataSource.removeAll(ids, scopedCid, scopedUid);
                break;
        }
        return ids;
    },

    /**
     * [초기화] 특정 도메인 전체 삭제
     */
    clear: async <K extends CacheType>(payload: { type: K; cid: string; uid: string }): Promise<void> => {
        const scopedUid = resolveScopedUid(payload.type, payload.uid);
        const scopedCid = resolveScopedCid(payload.type, payload.cid);
        switch (payload.type) {
            case 'chat':
                await chatDataSource.clear(scopedCid, scopedUid);
                break;
            case 'channel':
                await channelDataSource.clear(scopedCid, scopedUid);
                break;
            case 'join':
                await joinDataSource.clear(scopedCid, scopedUid);
                break;
            case 'site':
                await siteDataSource.clear(scopedCid, scopedUid);
                break;
            case 'user':
                await userDataSource.clear(scopedCid, scopedUid);
                break;
            case 'invitecloud':
                await inviteCloudDataSource.clear(scopedCid, scopedUid);
                break;
        }
        await metaDataSource.clear(payload.type, scopedCid, scopedUid);
    },
};
