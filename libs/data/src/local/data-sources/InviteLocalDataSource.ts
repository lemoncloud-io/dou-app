import type { DomainInvite, DomainListResult } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContextProvider } from '../../repositories/types';
import type { CacheStorage } from '../ports';
import {
    BaseLocalDataSource,
    type ILocalDataSource,
    type LocalDataSourceCallback,
    type LocalDataSourceContextOverride,
    type LocalDataSourceUnsubscribe,
} from './types';

export interface IInviteLocalDataSource
    extends ILocalDataSource<DomainInvite, undefined, DomainListResult<DomainInvite>> {}

/**
 * Persists the sender's own relay 1:1 invite cards locally (ADR-0052). Read-side of the
 * "즉시 렌더 + 항상 재검증" design: this class only ever answers with what is on disk —
 * revalidating against the server is `InviteRepository.list`'s job, not this class's.
 *
 * A plain field-spread merge on write is deliberate: `cacheWrite`/`cacheWriteMany` overwrite
 * every key the caller passes, but a key the caller never mentions (`dismissedAt`, stamped only
 * by `dismiss()`) survives untouched. The list-sync path (`InviteRepository.list`, via
 * `toCacheInviteView`) never emits `dismissedAt`, so a full list refresh naturally preserves it
 * without any special-cased field list — "response is authoritative for what it says, silent on
 * everything else" falls out of an ordinary merge.
 *
 * Rows outside the server's list window are never deleted by this class — there is no
 * `cacheDeleteMany` call on the list-sync path. Only the reconcile/migration cleanup (draining a
 * legacy dismiss stub) calls `cacheDelete` explicitly.
 */
export class InviteLocalDataSource extends BaseLocalDataSource implements IInviteLocalDataSource {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'invite'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(
        id: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainInvite | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.cacheStorage.load(requiredId);
    }

    public async cacheReadList(
        _query: undefined,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainInvite> | null> {
        const items = await this.cacheStorage.loadAll();
        // Newest first, matching the server's `invite.list` order. Ties (equal/missing
        // createdAt) break on `id` descending so ordering stays deterministic across reads.
        const list = [...items].sort((left, right) => {
            const byCreatedAt = (right.createdAt ?? 0) - (left.createdAt ?? 0);
            if (byCreatedAt !== 0) return byCreatedAt;
            return String(right.id ?? '').localeCompare(String(left.id ?? ''), undefined, { numeric: true });
        });

        return createDomainListResult(list, { total: list.length, source: 'local' });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceCallback<DomainInvite | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback, contextOverride);
    }

    public observeList(
        query: undefined,
        callback: LocalDataSourceCallback<DomainListResult<DomainInvite> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeListQuery(
            this.createListObserverKey(['invites'], contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainInvite>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');
        const existing = await this.cacheStorage.load(id);
        const context = this.getContext(contextOverride);
        const merged: DomainInvite = {
            ...(existing ?? ({} as DomainInvite)),
            ...item,
            id,
            cid: context.cid || 'default',
            uid: context.uid || 'default',
        };
        await this.cacheStorage.save(id, merged);
        this.scheduleItemReemit([id], contextOverride);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|invites`]);
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainInvite>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || 'default';
        const uid = context.uid || 'default';
        const existingById = this.indexById(await this.cacheStorage.loadMany(validItems.map(item => item.id!)));
        const mergedList = validItems.map(item => {
            const existing = existingById.get(item.id!);
            return {
                ...(existing ?? ({} as DomainInvite)),
                ...item,
                id: item.id!,
                cid,
                uid,
            } as DomainInvite;
        });

        await this.cacheStorage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean), contextOverride);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|invites`]);
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId], contextOverride);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|invites`]);
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds, contextOverride);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|invites`]);
    }

    public async cacheClear(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }
}
