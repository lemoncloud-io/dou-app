import type { DomainListResult, DomainProfile, DomainProfileListPayload } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContextProvider } from '../../repositories/types';
import type { ScopedCacheStorage } from '../ports';
import {
    BaseLocalDataSource,
    type ILocalDataSource,
    type LocalDataSourceCallback,
    type LocalDataSourceContextOverride,
    type LocalDataSourceUnsubscribe,
} from './types';

export interface IProfileLocalDataSource
    extends ILocalDataSource<DomainProfile, DomainProfileListPayload | undefined, DomainListResult<DomainProfile>> {}

/** Stores site profiles by normalized `sid@uid` keys and re-emits affected scoped observers. */
export class ProfileLocalDataSource extends BaseLocalDataSource<'profile'> implements IProfileLocalDataSource {
    constructor(contextProvider: DataContextProvider, storages: ScopedCacheStorage<'profile'>) {
        super(contextProvider, storages);
    }

    public async cacheRead(
        id: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainProfile | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.storage(contextOverride).load(requiredId);
    }

    public async cacheReadList(
        query?: DomainProfileListPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainProfile> | null> {
        // Only the query decides the site filter — an ambient fallback would make the same query
        // answer differently per selected site, invisibly to the observer key (ADR-0085).
        const sid = query?.sid || query?.siteId || '';
        const uid = query?.uid || query?.userId;
        // Storage partitions only by cid/uid; sid is a logical filter applied here in memory.
        const allItems = await this.storage(contextOverride).loadAll();

        const deduped = new Map<string, DomainProfile>();
        for (const item of allItems) {
            const canonicalId = this.buildCanonicalProfileId(item.sid, item.uid || item.userId);
            const previous = deduped.get(canonicalId);
            if (!previous || (item.updatedAtMs ?? 0) >= (previous.updatedAtMs ?? 0)) {
                deduped.set(canonicalId, {
                    ...item,
                    id: canonicalId,
                });
            }
        }
        let list = [...deduped.values()];

        if (sid) {
            list = list
                .map(data => {
                    return data;
                })
                .filter(item => item.sid === sid);
        }
        if (uid) {
            list = list.filter(item => item.uid === uid || item.userId === uid);
        }

        return createDomainListResult(list, {
            total: list.length,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceCallback<DomainProfile | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback, contextOverride);
    }

    public observeList(
        query: DomainProfileListPayload | undefined,
        callback: LocalDataSourceCallback<DomainListResult<DomainProfile> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainProfile>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        // Load the cached row BEFORE normalizing so partial payloads merge instead of
        // overwriting (mirrors cacheWriteMany): a profile.get/profile.set response that
        // omits `thumbnail` must not wipe the photo already cached for that profile.
        const storage = this.storage(scope);
        const existingId = this.makeProfileId(item, scope);
        const existing = existingId ? await storage.load(existingId) : null;

        const normalized = this.normalizeProfile(item, existing ?? undefined, scope);
        if (!normalized) return;

        await storage.save(normalized.id, normalized);
        const legacyId = this.buildLegacyProfileId(normalized.sid, normalized.uid);
        if (legacyId && legacyId !== normalized.id) {
            await storage.delete(legacyId);
        }
        this.scheduleItemReemit([normalized.id], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.sid, normalized.sid], scope));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainProfile>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        // Read the existing rows in one call. This used to issue a `load` per item, so syncing 50
        // profiles began with 50 bridge round trips.
        const existingIds = items.map(item => this.makeProfileId(item, scope)).filter((id): id is string => !!id);
        const storage = this.storage(scope);
        const existingById = this.indexById(await storage.loadMany(existingIds));

        const normalized = items.map(item => {
            const existingId = this.makeProfileId(item, scope);
            const existing = existingId ? existingById.get(existingId) : undefined;
            return this.normalizeProfile(item, existing, scope);
        });
        const valid = normalized.filter((item): item is DomainProfile => !!item?.id);
        if (valid.length === 0) return;

        await storage.saveAll(valid);

        // Batch the legacy-key cleanup too. Individual `delete` calls pushed the round trips back to N
        // and were the other half of what made one write cost 2N+1 in total.
        const legacyIds = valid
            .map(item => ({ item, legacyId: this.buildLegacyProfileId(item.sid, item.uid) }))
            .filter(({ item, legacyId }) => !!legacyId && legacyId !== item.id)
            .map(({ legacyId }) => legacyId);
        if (legacyIds.length > 0) {
            await storage.deleteAll(Array.from(new Set(legacyIds)));
        }
        this.scheduleItemReemit(
            valid.map(item => item.id),
            scope
        );
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                valid.map(item => item.sid),
                scope
            )
        );
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const requiredId = this.assertRequiredString(id, 'id');
        const storage = this.storage(scope);
        const existing = await storage.load(requiredId);
        await storage.delete(requiredId);
        this.scheduleItemReemit([requiredId], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.sid], scope));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        // Only the affected sid set is needed, so ids omitted because they are absent do not matter.
        const storage = this.storage(scope);
        const existingItems = await storage.loadMany(validIds);
        await storage.deleteAll(validIds);
        this.scheduleItemReemit(validIds, scope);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item.sid),
                scope
            )
        );
    }

    public async cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.storage(contextOverride).clearAll();
        this.scheduleFullReemit();
    }

    private normalizeProfile(
        item: Partial<DomainProfile>,
        existing: DomainProfile | undefined,
        contextOverride?: LocalDataSourceContextOverride
    ): DomainProfile | null {
        const context = this.getContext(contextOverride);
        const sid = item.sid || (item as { siteId?: string }).siteId || existing?.sid || context.sid || '';
        const uid = item.uid || item.userId || existing?.uid || existing?.userId || context.uid || '';
        this.assertRequiredString(sid, 'sid');
        this.assertRequiredString(uid, 'uid');

        const merged: DomainProfile = {
            ...(existing ?? ({} as DomainProfile)),
            ...item,
            id: this.buildCanonicalProfileId(sid, uid),
            cid: item.cid || existing?.cid || context.cid || 'default',
            sid,
            siteId: sid,
            uid,
            userId: item.userId || existing?.userId || uid,
            updatedAtMs: item.updatedAtMs ?? existing?.updatedAtMs ?? Date.now(),
        };

        return merged;
    }

    private makeProfileId(
        item: Partial<DomainProfile> | DomainProfileListPayload | undefined,
        contextOverride?: LocalDataSourceContextOverride
    ): string {
        if (!item) return '';
        const sid =
            (item as DomainProfile).sid ||
            (item as { sid?: string; siteId?: string }).sid ||
            (item as { siteId?: string }).siteId ||
            this.getSid(contextOverride) ||
            '';
        const uid =
            (item as DomainProfile).uid ||
            (item as { uid?: string; userId?: string }).uid ||
            (item as { userId?: string }).userId ||
            this.getUid(contextOverride);
        return this.buildCanonicalProfileId(sid, uid);
    }

    private buildCanonicalProfileId(sid?: string, uid?: string): string {
        return sid && uid ? `${sid}@${uid}` : '';
    }

    private buildLegacyProfileId(sid?: string, uid?: string): string {
        return sid && uid ? `${sid}:${uid}` : '';
    }

    private getListKey(
        query: DomainProfileListPayload | undefined,
        contextOverride?: LocalDataSourceContextOverride
    ): string {
        return this.createListObserverKey(
            [
                'profiles',
                `sid:${query?.sid || query?.siteId || '__all__'}`,
                `uid:${query?.uid || query?.userId || '__all__'}`,
            ],
            contextOverride
        );
    }

    private getAffectedListPrefixes(
        sids: Array<string | undefined>,
        contextOverride?: LocalDataSourceContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const uniqueSids = Array.from(new Set(sids.map(sid => sid || '__all__')));
        // Written sids, plus the all-sites observers (`sid:__all__`, what getListKey falls back to)
        // which must hear about every sid.
        //
        // Two traps, both from `flush` matching with `key.startsWith(prefix)`:
        //  - A bare `${scopeKey}|profiles` prefix matches EVERY profile observer, so one write woke
        //    them all and each wake re-reads storage.
        //  - Without the trailing `|`, `sid:site-1` also matches `sid:site-10`. The delimiter pins
        //    the match to a whole key segment.
        return [`${scopeKey}|profiles|sid:__all__|`, ...uniqueSids.map(sid => `${scopeKey}|profiles|sid:${sid}|`)];
    }
}
