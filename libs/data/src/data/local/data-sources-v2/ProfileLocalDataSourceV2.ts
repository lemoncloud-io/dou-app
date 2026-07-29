import type { DomainListResult, DomainProfile, DomainProfileListPayload } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContextProvider } from '../../repositories-v2/types';
import type { CacheStorage } from '../storages';
import {
    BaseLocalDataSourceV2,
    type ILocalDataSourceV2,
    type LocalDataSourceV2Callback,
    type LocalDataSourceV2ContextOverride,
    type LocalDataSourceV2Unsubscribe,
} from './types';

export interface IProfileLocalDataSourceV2
    extends ILocalDataSourceV2<DomainProfile, DomainProfileListPayload | undefined, DomainListResult<DomainProfile>> {}

/** Stores site profiles by normalized `sid@uid` keys and re-emits affected scoped observers. */
export class ProfileLocalDataSourceV2 extends BaseLocalDataSourceV2 implements IProfileLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'profile'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(
        id: string,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainProfile | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.cacheStorage.load(requiredId);
    }

    public async cacheReadList(
        query?: DomainProfileListPayload,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainListResult<DomainProfile> | null> {
        const sid = query?.sid || query?.siteId || this.getSid(contextOverride) || '';
        const uid = query?.uid || query?.userId;
        // Storage partitions only by cid/uid; sid is a logical filter applied here in memory.
        const allItems = await this.cacheStorage.loadAll();

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
        callback: LocalDataSourceV2Callback<DomainProfile | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback);
    }

    public observeList(
        query: DomainProfileListPayload | undefined,
        callback: LocalDataSourceV2Callback<DomainListResult<DomainProfile> | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainProfile>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        // Load the cached row BEFORE normalizing so partial payloads merge instead of
        // overwriting (mirrors cacheWriteMany): a profile.get/profile.set response that
        // omits `thumbnail` must not wipe the photo already cached for that profile.
        const existingId = this.makeProfileId(item, contextOverride);
        const existing = existingId ? await this.cacheStorage.load(existingId) : null;

        const normalized = this.normalizeProfile(item, existing ?? undefined, contextOverride);
        if (!normalized) return;

        await this.cacheStorage.save(normalized.id, normalized);
        const legacyId = this.buildLegacyProfileId(normalized.sid, normalized.uid);
        if (legacyId && legacyId !== normalized.id) {
            await this.cacheStorage.delete(legacyId);
        }
        this.scheduleItemReemit([normalized.id]);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.sid, normalized.sid], contextOverride));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainProfile>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const normalized = await Promise.all(
            items.map(async item => {
                const existingId = this.makeProfileId(item, contextOverride);
                const existing = existingId ? await this.cacheStorage.load(existingId) : null;
                return this.normalizeProfile(item, existing ?? undefined, contextOverride);
            })
        );
        const valid = normalized.filter((item): item is DomainProfile => !!item?.id);
        if (valid.length === 0) return;

        await this.cacheStorage.saveAll(valid);
        await Promise.all(
            valid.map(item => {
                const legacyId = this.buildLegacyProfileId(item.sid, item.uid);
                return legacyId && legacyId !== item.id ? this.cacheStorage.delete(legacyId) : Promise.resolve();
            })
        );
        this.scheduleItemReemit(valid.map(item => item.id));
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                valid.map(item => item.sid),
                contextOverride
            )
        );
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        const existing = await this.cacheStorage.load(requiredId);
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.sid], contextOverride));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        const existingItems = await Promise.all(validIds.map(id => this.cacheStorage.load(id)));
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item?.sid),
                contextOverride
            )
        );
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }

    private normalizeProfile(
        item: Partial<DomainProfile>,
        existing: DomainProfile | undefined,
        contextOverride?: LocalDataSourceV2ContextOverride
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
        contextOverride?: LocalDataSourceV2ContextOverride
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
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string {
        return this.createListObserverKey(
            [
                'profiles',
                `sid:${query?.sid || query?.siteId || this.getSid(contextOverride) || '__all__'}`,
                `uid:${query?.uid || query?.userId || '__all__'}`,
            ],
            contextOverride
        );
    }

    private getAffectedListPrefixes(
        sids: Array<string | undefined>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const uniqueSids = Array.from(new Set(sids.map(sid => sid || '__all__')));
        return [`${scopeKey}|profiles`, ...uniqueSids.map(sid => `${scopeKey}|profiles|sid:${sid}`)];
    }
}
