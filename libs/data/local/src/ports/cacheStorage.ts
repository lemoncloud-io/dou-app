import type {
    CacheModelOf,
    CacheQueryOf,
    CacheType,
    ChatMediaCounts,
    ChatMediaFillItem,
    ChatMediaKind,
    ChatMediaPage,
    LastChatItem,
} from '@chatic/bridge-messages';
import type { DataContext, DataContextProvider } from '@chatic/data-model';
import { stableHash } from '../stableHash';
import { resolveScopedContext } from './policy';

export interface DbTable<TType extends CacheType> {
    save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>>;
    saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]>;
    load(id: string): Promise<CacheModelOf<TType> | null>;
    loadMany(ids: string[]): Promise<CacheModelOf<TType>[]>;
    loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
    clearByChannelId(channelId: string): Promise<void>;
    loadLastPerChannel?(channelIds: string[]): Promise<LastChatItem[] | null>;

    canQueryChatMedia?(): boolean;

    loadChatMedia?(query: ChatMediaQuery): Promise<ChatMediaPage | null>;

    countChatMedia?(channelId: string): Promise<ChatMediaCounts | null>;

    saveChatMediaEntries?(items: ChatMediaFillItem[], version: number): Promise<void>;
}

export interface ChatMediaQuery {
    channelId: string;
    kind: ChatMediaKind;
    cursorNo?: number;
    limit: number;
}

export type CacheStorageItem<TType extends CacheType> = CacheModelOf<TType>;

export interface CacheSchema<TType extends CacheType> {
    key: string;
    type: TType;
    cid: string;
    uid: string;
    id: string;
    data: CacheModelOf<TType>;
}

export type CacheStorageFactory = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
) => CacheStorage<TType>;

export interface ScopedCacheStorage<TType extends CacheType> {
    forScope(context: DataContext): CacheStorage<TType>;
}

export const createScopedCacheStorage = <TType extends CacheType>(
    type: TType,
    storageFactory: CacheStorageFactory,
    initialContext?: DataContext
): ScopedCacheStorage<TType> => {
    const byPartition = new Map<string, CacheStorage<TType>>();

    const forScope = (context: DataContext): CacheStorage<TType> => {
        const scope: DataContext = { cid: context.cid, uid: context.uid };
        const provider: DataContextProvider = { getContext: () => scope, setContext: () => undefined };
        const partitionKey = stableHash(resolveScopedContext(type, provider));
        let storage = byPartition.get(partitionKey);
        if (!storage) {
            storage = storageFactory(type, provider);
            byPartition.set(partitionKey, storage);
        }
        return storage;
    };

    if (initialContext) forScope(initialContext);
    return { forScope };
};

export interface LocalCacheStorages {
    channel: ScopedCacheStorage<'channel'>;
    chat: ScopedCacheStorage<'chat'>;
    inviteCloud: ScopedCacheStorage<'invitecloud'>;
    join: ScopedCacheStorage<'join'>;
    profile: ScopedCacheStorage<'profile'>;
    site: ScopedCacheStorage<'site'>;
    user: ScopedCacheStorage<'user'>;
    meta: ScopedCacheStorage<'meta'>;
    invite: ScopedCacheStorage<'invite'>;
}

export const createCacheStorages = (
    contextProvider: DataContextProvider,
    storageFactory: CacheStorageFactory
): LocalCacheStorages => {
    const initialContext = contextProvider.getContext();
    const slot = <TType extends CacheType>(type: TType): ScopedCacheStorage<TType> =>
        createScopedCacheStorage(type, storageFactory, initialContext);
    return {
        channel: slot('channel'),
        chat: slot('chat'),
        inviteCloud: slot('invitecloud'),
        join: slot('join'),
        profile: slot('profile'),
        site: slot('site'),
        user: slot('user'),
        meta: slot('meta'),
        invite: slot('invite'),
    };
};

export type CacheStorage<TType extends CacheType> = DbTable<TType>;
