import type { CacheModelMap, CacheQueryMap, CacheType, LastChatItem, PagingMeta } from '@chatic/app-messages';
import type { ICacheCrudService } from './types';
import type { ILogService } from '../log';
import type { ICacheDataSource, IChatCacheDataSource } from '../../data/cache';

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
    private readonly chatDataSource: IChatCacheDataSource<CacheModelMap['chat'], CacheQueryMap['chat']>;
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
        chatDataSource: IChatCacheDataSource<CacheModelMap['chat'], CacheQueryMap['chat']>,
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
     * Type → data source. Only `fetchMany` uses this.
     *
     * The other operations spell out their own switch because each domain's argument order/shape
     * differs (`fetchAll` takes (cid, query, uid), `save` takes (id, item, cid, uid)), whereas every
     * domain's `fetchMany` takes the same (ids, cid, uid), so the only branching needed is picking
     * the data source. The rule of answering unsupported types with `null` here matches the existing
     * `default` arm elsewhere — since the web ships ahead of the app, an unknown type can arrive,
     * and throwing on it would turn into a bridge error that makes the web's fallback decision harder.
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

            // `fetchMany` is optional to implement. If it's absent, we fall back to repeated
            // `fetch` calls — the bridge round trip is still just 1, so the goal (folding round
            // trips) is still met. All that slows down is the number of in-process SQLite queries,
            // which is negligible next to a round trip.
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

    /**
     * [Fetch] One latest preview per channel plus the max chat_no (chat only, ADR-0057).
     *
     * `null` means "cannot answer" — the web falls back to a per-channel windowed query for just
     * that one read. Answering with null instead of throwing follows the same rationale as the
     * other operations' error rules: since the web ships ahead of the app, a bridge error would
     * only make the fallback decision harder.
     */
    public async fetchLastChats(payload: {
        type: 'chat';
        channelIds: string[];
        cid?: string;
        uid?: string;
    }): Promise<LastChatItem[] | null> {
        const { type, channelIds, cid, uid } = payload;
        if (type !== 'chat') return null;

        try {
            return await this.chatDataSource.fetchLastPerChannel(channelIds ?? [], cid, uid);
        } catch (error) {
            this.logService.error('CACHE', 'FetchLastChats error', error as Error);
            return null;
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
            // Meta table save logic has been removed
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

    /**
     * Removes only the rows for one channel (ADR-0067). Leaving a room should also make that
     * room's messages disappear, which `clear` (which wipes the whole scope) can't express.
     *
     * Only accepts chat. The `channel_id` extracted column also exists on join, but there's no
     * path for the web to send this message for join, so we'll add another arm if that ever happens.
     *
     * Unlike `clear`, this does not swallow errors — the caller (the handler) has to signal the
     * failure through the response's `success` field so the web doesn't wrongly believe it was
     * deleted. For the same reason, an empty channelId isn't silently allowed through either.
     */
    public async clearByChannel<K extends CacheType>(payload: {
        type: K;
        channelId: string;
        cid?: string;
        uid?: string;
    }): Promise<void> {
        const { type, channelId, cid, uid } = payload;
        if (!channelId) throw new Error('clearByChannel requires a channelId');
        if (type !== 'chat') throw new Error(`clearByChannel is not supported for type: ${type}`);
        await this.chatDataSource.clearByChannel(channelId, cid, uid);
    }
}
