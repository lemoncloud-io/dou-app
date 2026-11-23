import type { runtime } from '@chatic/runtime';

type PageRepositories = runtime.data.PageRepositories;

export type CacheDomainKey = 'channel' | 'chat' | 'user' | 'join' | 'place' | 'cloud' | 'profile' | 'invite';

export interface CacheDomain {
    key: CacheDomainKey;
    cacheType: string;
    repository: keyof PageRepositories;
    listBy: 'scope' | 'channel';
}

export const CACHE_DOMAINS: readonly CacheDomain[] = [
    { key: 'channel', cacheType: 'channel', repository: 'channel', listBy: 'scope' },
    { key: 'chat', cacheType: 'chat', repository: 'chat', listBy: 'channel' },
    { key: 'user', cacheType: 'user', repository: 'user', listBy: 'scope' },
    { key: 'join', cacheType: 'join', repository: 'join', listBy: 'channel' },
    { key: 'place', cacheType: 'site', repository: 'place', listBy: 'scope' },
    { key: 'cloud', cacheType: 'invitecloud', repository: 'cloud', listBy: 'scope' },
    { key: 'profile', cacheType: 'profile', repository: 'profile', listBy: 'scope' },
    { key: 'invite', cacheType: 'invite', repository: 'invite', listBy: 'scope' },
];

export const cacheDomain = (key: CacheDomainKey): CacheDomain => CACHE_DOMAINS.find(d => d.key === key)!;

export type CacheRow = { id: string; [field: string]: unknown };

interface CacheRepository {
    cacheReadList(query?: unknown): Promise<{ list?: CacheRow[] } | null>;
    cacheWrite(item: Partial<CacheRow>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

const repositoryOf = (repos: PageRepositories, domain: CacheDomain): CacheRepository =>
    repos[domain.repository] as unknown as CacheRepository;

export interface LoadOptions {
    channelId?: string;
    perChannelLimit?: number;
}

export interface LoadResult {
    rows: CacheRow[];
    failures: { channelId: string; message: string }[];
}

export const DEFAULT_PER_CHANNEL_LIMIT = 50;

const listOf = (result: { list?: CacheRow[] } | null | undefined): CacheRow[] => result?.list ?? [];

export const cachedChannelIds = async (repos: PageRepositories): Promise<string[]> =>
    listOf(await repositoryOf(repos, cacheDomain('channel')).cacheReadList({}))
        .map(row => row.id)
        .filter(Boolean);

export const loadDomainRows = async (
    repos: PageRepositories,
    domain: CacheDomain,
    { channelId, perChannelLimit = DEFAULT_PER_CHANNEL_LIMIT }: LoadOptions = {}
): Promise<LoadResult> => {
    const repo = repositoryOf(repos, domain);
    if (domain.listBy === 'scope') {
        const query = channelId && domain.key === 'user' ? { channelId } : {};
        return { rows: listOf(await repo.cacheReadList(query)), failures: [] };
    }
    const channelIds = channelId ? [channelId] : await cachedChannelIds(repos);
    const rows: CacheRow[] = [];
    const failures: LoadResult['failures'] = [];
    for (const id of channelIds) {
        try {
            const query = domain.key === 'chat' ? { channelId: id, limit: perChannelLimit } : { channelId: id };
            rows.push(...listOf(await repo.cacheReadList(query)));
        } catch (e) {
            failures.push({ channelId: id, message: (e as Error).message ?? String(e) });
        }
    }
    return { rows, failures };
};

export const assertWritableRow = (value: unknown): CacheRow => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('a row is a JSON object');
    }
    const id = (value as { id?: unknown }).id;
    if (typeof id !== 'string' || id === '') throw new Error('a row needs a non-empty string "id"');
    return value as CacheRow;
};

export const writeDomainRow = (repos: PageRepositories, domain: CacheDomain, row: CacheRow): Promise<void> =>
    repositoryOf(repos, domain).cacheWrite(row);

export const deleteDomainRow = (repos: PageRepositories, domain: CacheDomain, id: string): Promise<void> =>
    repositoryOf(repos, domain).cacheDelete(id);

export const clearDomain = (repos: PageRepositories, domain: CacheDomain): Promise<void> =>
    repositoryOf(repos, domain).cacheClear();

export const rowKey = (row: CacheRow, index: number): string =>
    `${typeof row.channelId === 'string' ? row.channelId : ''}:${row.id}:${index}`;

let templateSeq = 0;
const makeId = (key: CacheDomainKey): string => `dbg-${key}-${Date.now().toString(36)}-${templateSeq++}`;

export const TEMPLATES: Record<CacheDomainKey, () => CacheRow> = {
    channel: () => ({ id: makeId('channel'), sid: '', name: 'Debug Channel' }),
    chat: () => ({ id: makeId('chat'), channelId: '', chatNo: 0, content: 'debug message' }),
    user: () => ({ id: makeId('user'), name: 'Debug User' }),
    join: () => ({ id: makeId('join'), channelId: '', userId: '', readNo: 0 }),
    place: () => ({ id: makeId('place'), name: 'Debug Place' }),
    cloud: () => ({ id: makeId('cloud'), name: 'Debug Cloud' }),
    profile: () => ({ id: makeId('profile'), sid: '', nick: 'Debug Nick' }),
    invite: () => ({ id: makeId('invite'), name: 'Debug Invite', state: 'pending' }),
};
