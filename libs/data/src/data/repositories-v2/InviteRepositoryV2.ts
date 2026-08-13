import type { InviteCreateInput, InviteListInput } from '@lemoncloud/chatic-sockets-lib';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { DomainInvite, DomainListResult } from '../domain';
import { createDomainListResult } from '../domain';
import { toCacheInviteView } from '../local/data-sources-v2/inviteCacheView';
import type { IInviteLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IInviteRemoteDataSource, RelayInviteView } from '../remote/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface IInviteRepositoryV2 extends DisposableRepositoryV2 {
    /**
     * invite.list — the inviter's own invite cards, newest first. Pass a filter to narrow by state.
     * Remote read on every call: an invite changes on the RECIPIENT's device and no notification
     * packet announces it, so callers own a polling/refetch cadence instead of trusting a cache.
     *
     * As a side effect, mirrors the response into the local cache (credential fields stripped —
     * see `toCacheInviteView`) so the NEXT cold boot can render instantly before this call
     * completes. The returned value is always the untouched server response — code included.
     */
    list(filter?: InviteListInput | null): Promise<MyInviteView[]>;

    /** invite.create — issue a number-bound invite code. The returned view carries the `deeplink` to hand off. */
    create(input: InviteCreateInput): Promise<MyInviteView>;

    /**
     * invite.get — inspect whether a code is still usable. Expiry and prior acceptance are NOT
     * failures; they arrive as `state`. `needVerify` says the reader must prove their number first.
     */
    get(code: string): Promise<RelayInviteView>;

    /** invite.accept — redeem a code. Idempotent server-side; success is `state === 'accepted'`. */
    accept(code: string): Promise<MyInviteView>;

    /**
     * invite.cancel — retire my own invite. Session-ownership authorization (403 otherwise),
     * 409 once accepted, idempotent on already-final invites. Success is `state === 'canceled'`.
     */
    cancel(code: string): Promise<MyInviteView>;

    /**
     * invite.reject — decline a received invite. Code possession is enough (no verification),
     * 409 once accepted, idempotent. Success is `state === 'rejected'`.
     */
    reject(code: string): Promise<MyInviteView>;

    /** Local cache read (instant, no server round trip) — what a cold boot renders before `list` returns. */
    cacheReadList(): Promise<DomainListResult<DomainInvite>>;
    observeList(callback: (result: DomainListResult<DomainInvite> | null) => void): () => void;

    /**
     * Stamps a local-only hide on a cache row (a `rejected` row the sender re-invited over, or a
     * legacy pre-API cancel stamp mid-migration). Never touches the server. No-op off the default
     * cloud (see the class-level note on why every local write here is cid-gated).
     */
    dismiss(id: string): Promise<void>;
    /** Clears a dismiss stamp — used only by the legacy-reconcile drain once it acts on a record. */
    undismiss(id: string): Promise<void>;

    /** Bulk local write — used by the one-time legacy dismiss-stamp migration to seed stub rows. */
    cacheWriteMany(items: Array<Partial<DomainInvite>>): Promise<void>;
    /** Single-row local write — same id overwrites (see `InviteLocalDataSourceV2`'s merge). Debug tooling only. */
    cacheWrite(item: Partial<DomainInvite>): Promise<void>;
    /** Drops a local row outright — used by reconcile once a legacy record is fully drained. */
    cacheDelete(id: string): Promise<void>;
    /** Empties the invite cache for the active scope. Debug tooling only. */
    cacheClear(): Promise<void>;
}

/**
 * Relay 1:1 (DM) invites (ADR-0052). Local-first for reads that only need "what did the last
 * server response say" (the sender's own list), remote-only for everything else — accept/cancel/
 * reject/create/get are commands or code-driven inspections with no cache slot of their own.
 *
 * The cache is never authority: acceptance/rejection happen on someone else's device with no
 * notification packet, so `list` always re-asks the server and the cache only ever reflects the
 * last response it saw (stale-while-revalidate). `code`/`deeplink` never reach the cache — see
 * `toCacheInviteView`.
 */
export class InviteRepositoryV2 extends BaseRepositoryV2 implements IInviteRepositoryV2 {
    constructor(
        private readonly inviteRemoteDataSource: IInviteRemoteDataSource,
        private readonly inviteLocalDataSource: IInviteLocalDataSourceV2,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public async list(filter: InviteListInput | null = null): Promise<MyInviteView[]> {
        const views = await this.inviteRemoteDataSource.listInvites(filter);
        await this.mirrorToCache(views);
        return views;
    }

    public async create(input: InviteCreateInput): Promise<MyInviteView> {
        return this.inviteRemoteDataSource.createInvite(input);
    }

    public async get(code: string): Promise<RelayInviteView> {
        return this.inviteRemoteDataSource.getInvite(code);
    }

    public async accept(code: string): Promise<MyInviteView> {
        return this.inviteRemoteDataSource.acceptInvite(code);
    }

    public async cancel(code: string): Promise<MyInviteView> {
        return this.inviteRemoteDataSource.cancelInvite(code);
    }

    public async reject(code: string): Promise<MyInviteView> {
        return this.inviteRemoteDataSource.rejectInvite(code);
    }

    public async cacheReadList(): Promise<DomainListResult<DomainInvite>> {
        return (
            (await this.inviteLocalDataSource.cacheReadList(undefined, this.getRepositoryContext())) ??
            createDomainListResult([], { total: 0, source: 'local' })
        );
    }

    public observeList(callback: (result: DomainListResult<DomainInvite> | null) => void): () => void {
        return this.inviteLocalDataSource.observeList(undefined, callback, this.getRepositoryContext());
    }

    public async dismiss(id: string): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheWrite({ id, dismissedAt: Date.now() }, this.getRepositoryContext());
    }

    public async undismiss(id: string): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheWrite({ id, dismissedAt: undefined }, this.getRepositoryContext());
    }

    public async cacheWriteMany(items: Array<Partial<DomainInvite>>): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public async cacheWrite(item: Partial<DomainInvite>): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public async cacheDelete(id: string): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public async cacheClear(): Promise<void> {
        if (!this.isDefaultCloud()) return;
        await this.inviteLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    /**
     * Writes are gated to the default (relay) cloud even though `list` itself is not — a cloud
     * session's socket also answers `invite.list` (unauthenticated for that domain, but the call
     * still resolves), and caching under an active cloud's partition would seed orphan rows nothing
     * ever reads back (invite rows only render `isDefaultCloud`). `contextOverride` cannot fix this
     * the way it does for other domains: the read path (`resolveScopedContext`) ignores it for
     * every type except `invitecloud`, so the only lever left is skipping the write entirely.
     *
     * Applied to every local write this repository exposes, not just the `list` mirror — a
     * dismiss/undismiss/stub-cleanup fired while some other cloud happens to be active (a stale
     * deep link to the waiting screen, say) would otherwise seed the exact same kind of orphan row.
     */
    private isDefaultCloud(): boolean {
        return (this.getNormalizedContext().cid || 'default') === 'default';
    }

    private async mirrorToCache(views: MyInviteView[]): Promise<void> {
        const context = this.getNormalizedContext();
        if (!this.isDefaultCloud()) return;

        const cid = context.cid || 'default';
        const uid = context.uid || 'default';
        const mapped = views.map(view => toCacheInviteView(view, { cid, uid }));
        await this.inviteLocalDataSource.cacheWriteMany(mapped, context);
    }
}
