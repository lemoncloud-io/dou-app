import type { CacheModelMap, CacheQueryMap, CacheType } from '@chatic/app-messages';
import {
    channelDataSource,
    chatDataSource,
    inviteCloudDataSource,
    joinDataSource,
    siteDataSource,
    userDataSource,
} from './sqlite';

export const cacheCrudService = {
    /**
     * [조회] 단건 캐시 데이터 조회
     */
    fetch: async <K extends CacheType>(payload: {
        type: K;
        id: string;
        cid?: string;
    }): Promise<CacheModelMap[K] | null> => {
        const { type, id, cid } = payload;
        switch (type) {
            case 'chat':
                return (await chatDataSource.fetch(id, cid)) as CacheModelMap[K] | null;
            case 'channel':
                return (await channelDataSource.fetch(id, cid)) as CacheModelMap[K] | null;
            case 'join':
                return (await joinDataSource.fetch(id, cid)) as CacheModelMap[K] | null;
            case 'site':
                return (await siteDataSource.fetch(id, cid)) as CacheModelMap[K] | null;
            case 'user':
                return (await userDataSource.fetch(id, cid)) as CacheModelMap[K] | null;
            case 'invitecloud':
                return (await inviteCloudDataSource.fetch(id, cid)) as CacheModelMap[K] | null;
            default:
                return null;
        }
    },

    /**
     * [조회] 다수/페이징 캐시 조회
     */
    fetchAll: async <K extends CacheType>(payload: {
        type: K;
        query?: CacheQueryMap[K];
        cid?: string;
    }): Promise<CacheModelMap[K][]> => {
        const { type, query, cid } = payload;
        switch (type) {
            case 'chat':
                return (await chatDataSource.fetchAll(cid, query as CacheQueryMap['chat'])) as CacheModelMap[K][];
            case 'channel':
                return (await channelDataSource.fetchAll(cid, query as CacheQueryMap['channel'])) as CacheModelMap[K][];
            case 'join':
                return (await joinDataSource.fetchAll(cid, query as CacheQueryMap['join'])) as CacheModelMap[K][];
            case 'site':
                return (await siteDataSource.fetchAll(cid, query as CacheQueryMap['site'])) as CacheModelMap[K][];
            case 'user':
                return (await userDataSource.fetchAll(cid, query as CacheQueryMap['user'])) as CacheModelMap[K][];
            case 'invitecloud':
                return (await inviteCloudDataSource.fetchAll(
                    cid,
                    query as CacheQueryMap['invitecloud']
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
    }): Promise<string> => {
        const { type, id, item, cid } = payload;
        switch (type) {
            case 'chat':
                await chatDataSource.save(id, item as CacheModelMap['chat'], cid);
                break;
            case 'channel':
                await channelDataSource.save(id, item as CacheModelMap['channel'], cid);
                break;
            case 'join':
                await joinDataSource.save(id, item as CacheModelMap['join'], cid);
                break;
            case 'site':
                await siteDataSource.save(id, item as CacheModelMap['site'], cid);
                break;
            case 'user':
                await userDataSource.save(id, item as CacheModelMap['user'], cid);
                break;
            case 'invitecloud':
                await inviteCloudDataSource.save(id, item as CacheModelMap['invitecloud'], cid);
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
    }): Promise<string[]> => {
        const { type, items, cid } = payload;

        // 공통 ID 추출 헬퍼
        const formatItems = <T extends { id?: string }>(dataList: T[]) =>
            dataList.map(item => ({
                id: item.id || 'unknown',
                data: item,
            }));

        switch (type) {
            case 'chat':
                await chatDataSource.saveAll(formatItems(items as CacheModelMap['chat'][]), cid);
                break;
            case 'channel':
                await channelDataSource.saveAll(formatItems(items as CacheModelMap['channel'][]), cid);
                break;
            case 'join':
                await joinDataSource.saveAll(formatItems(items as CacheModelMap['join'][]), cid);
                break;
            case 'site':
                await siteDataSource.saveAll(formatItems(items as CacheModelMap['site'][]), cid);
                break;
            case 'user':
                await userDataSource.saveAll(formatItems(items as CacheModelMap['user'][]), cid);
                break;
            case 'invitecloud':
                await inviteCloudDataSource.saveAll(formatItems(items as CacheModelMap['invitecloud'][]), cid);
                break;
        }
        return items.map((i: any) => i.id);
    },

    /**
     * [삭제] 단일 아이템 삭제
     */
    delete: async <K extends CacheType>(payload: { type: K; id: string; cid: string }): Promise<string> => {
        const { type, id, cid } = payload;
        switch (type) {
            case 'chat':
                await chatDataSource.remove(id, cid);
                break;
            case 'channel':
                await channelDataSource.remove(id, cid);
                break;
            case 'join':
                await joinDataSource.remove(id, cid);
                break;
            case 'site':
                await siteDataSource.remove(id, cid);
                break;
            case 'user':
                await userDataSource.remove(id, cid);
                break;
            case 'invitecloud':
                await inviteCloudDataSource.remove(id, cid);
                break;
        }
        return id;
    },

    /**
     * [삭제] 다수 아이템 일괄 삭제
     */
    deleteAll: async <K extends CacheType>(payload: { type: K; ids: string[]; cid: string }): Promise<string[]> => {
        const { type, ids, cid } = payload;
        switch (type) {
            case 'chat':
                await chatDataSource.removeAll(ids, cid);
                break;
            case 'channel':
                await channelDataSource.removeAll(ids, cid);
                break;
            case 'join':
                await joinDataSource.removeAll(ids, cid);
                break;
            case 'site':
                await siteDataSource.removeAll(ids, cid);
                break;
            case 'user':
                await userDataSource.removeAll(ids, cid);
                break;
            case 'invitecloud':
                await inviteCloudDataSource.removeAll(ids, cid);
                break;
        }
        return ids;
    },

    /**
     * [초기화] 특정 도메인 전체 삭제
     */
    clear: async <K extends CacheType>(payload: { type: K }): Promise<void> => {
        switch (payload.type) {
            case 'chat':
                await chatDataSource.clear();
                break;
            case 'channel':
                await channelDataSource.clear();
                break;
            case 'join':
                await joinDataSource.clear();
                break;
            case 'site':
                await siteDataSource.clear();
                break;
            case 'user':
                await userDataSource.clear();
                break;
            case 'invitecloud':
                await inviteCloudDataSource.clear();
                break;
        }
    },
};
