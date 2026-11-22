/**
 * The DB screen's table of cache domains: what each one is called, which repository reads and writes
 * it, which cache type routes it, and how to read every row of it in one scope.
 *
 * Every read and write goes through the repository, never the store underneath, for two reasons. It is
 * the path the app takes, so a row written here is announced to the screens observing it and they
 * redraw — a write straight into IndexedDB or the shell's SQLite would sit unseen until something
 * re-read it. And it works whichever store the domain is routed to, including a launch whose session
 * the shell owns, where the page has no cache of its own and the repositories answer from the shell's
 * runtime.
 *
 * Some repositories only list one channel at a time (`chat` and `join` require a channel id). For those
 * the loader reads the channel list first and reads each channel in turn, so "every row" means every
 * row of every cached channel — `chat` capped at `perChannelLimit` newest rows per channel.
 */

import type { runtime } from '@chatic/runtime';

type PageRepositories = runtime.data.PageRepositories;

export type CacheDomainKey = 'channel' | 'chat' | 'user' | 'join' | 'place' | 'cloud' | 'profile' | 'invite';

export interface CacheDomain {
    key: CacheDomainKey;
    /** The cache type the router decides by (`site`, `invitecloud` are the stored names). */
    cacheType: string;
    repository: keyof PageRepositories;
    /** `channel`: the repository lists one channel per call, so the loader walks the channel list. */
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

/** The cache methods every listed repository has, typed loosely: each takes its own query shape. */
interface CacheRepository {
    cacheReadList(query?: unknown): Promise<{ list?: CacheRow[] } | null>;
    cacheWrite(item: Partial<CacheRow>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

const repositoryOf = (repos: PageRepositories, domain: CacheDomain): CacheRepository =>
    repos[domain.repository] as unknown as CacheRepository;

export interface LoadOptions {
    /** Only this channel, for a per-channel domain. Every cached channel when absent. */
    channelId?: string;
    /** `chat` rows per channel, newest first. */
    perChannelLimit?: number;
}

export interface LoadResult {
    rows: CacheRow[];
    /** Channels whose read failed, with the error — the rest are still listed. */
    failures: { channelId: string; message: string }[];
}

export const DEFAULT_PER_CHANNEL_LIMIT = 50;

const listOf = (result: { list?: CacheRow[] } | null | undefined): CacheRow[] => result?.list ?? [];

/** Every cached channel id in the scope, for the per-channel domains and the screen's channel picker. */
export const cachedChannelIds = async (repos: PageRepositories): Promise<string[]> =>
    listOf(await repositoryOf(repos, cacheDomain('channel')).cacheReadList({}))
        .map(row => row.id)
        .filter(Boolean);

/** Reads every row of `domain` in the scope `repos` is bound to. */
export const loadDomainRows = async (
    repos: PageRepositories,
    domain: CacheDomain,
    { channelId, perChannelLimit = DEFAULT_PER_CHANNEL_LIMIT }: LoadOptions = {}
): Promise<LoadResult> => {
    const repo = repositoryOf(repos, domain);
    if (domain.listBy === 'scope') {
        // `user` lists every cached user without a channel and filters by membership with one.
        const query = channelId && domain.key === 'user' ? { channelId } : {};
        return { rows: listOf(await repo.cacheReadList(query)), failures: [] };
    }
    const channelIds = channelId ? [channelId] : await cachedChannelIds(repos);
    const rows: CacheRow[] = [];
    const failures: LoadResult['failures'] = [];
    // One channel at a time: on the phone each read is a bridge round trip, and a burst of them would
    // queue behind the app's own reads.
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

/** A row's id must be a non-empty string: every repository keys its rows by it. */
export const assertWritableRow = (value: unknown): CacheRow => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('a row is a JSON object');
    }
    const id = (value as { id?: unknown }).id;
    if (typeof id !== 'string' || id === '') throw new Error('a row needs a non-empty string "id"');
    return value as CacheRow;
};

/**
 * Writes a row through the repository. The repositories merge a write into the cached row, so a field
 * removed in the editor stays as it was — `null` is how to clear one.
 */
export const writeDomainRow = (repos: PageRepositories, domain: CacheDomain, row: CacheRow): Promise<void> =>
    repositoryOf(repos, domain).cacheWrite(row);

export const deleteDomainRow = (repos: PageRepositories, domain: CacheDomain, id: string): Promise<void> =>
    repositoryOf(repos, domain).cacheDelete(id);

export const clearDomain = (repos: PageRepositories, domain: CacheDomain): Promise<void> =>
    repositoryOf(repos, domain).cacheClear();

/** A row key unique across channels: the same user or join id can be listed under two channels. */
export const rowKey = (row: CacheRow, index: number): string =>
    `${typeof row.channelId === 'string' ? row.channelId : ''}:${row.id}:${index}`;

// Monotonic suffix so one-click templates never collide within a session.
let templateSeq = 0;
const makeId = (key: CacheDomainKey): string => `dbg-${key}-${Date.now().toString(36)}-${templateSeq++}`;

/**
 * Starter rows for a new row. The repository stamps `cid`/`uid` from the scope it is bound to, so a
 * template carries only the id and the fields a row needs to be useful or visible.
 */
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
