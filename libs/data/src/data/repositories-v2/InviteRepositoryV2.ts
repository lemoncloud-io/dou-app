import type { InviteCreateInput, InviteListInput } from '@lemoncloud/chatic-sockets-lib';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { IInviteRemoteDataSource, RelayInviteView } from '../remote/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface IInviteRepositoryV2 extends DisposableRepositoryV2 {
    /**
     * invite.list — the inviter's own invite cards, newest first. Pass a filter to narrow by state.
     * Remote read on every call: an invite changes on the RECIPIENT's device and no notification
     * packet announces it, so callers own a polling/refetch cadence instead of trusting a cache.
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
}

/**
 * Relay 1:1 (DM) invites. Remote-only: this repository is an ACCESS surface, not a cache obligation
 * (see libs/app-runtime/docs/data-access.md). Invites have no offline requirement and the backend
 * has no accept notification, so persisting them would only serve stale cards — every call is a
 * pass-through to the relay-pinned gateway. Same shape as DeviceRepositoryV2, which is likewise
 * assembled without a local data source.
 *
 * When an accept notification lands, this is where `observe*`/local caching would be added — the
 * surface callers hold would not change.
 */
export class InviteRepositoryV2 extends BaseRepositoryV2 implements IInviteRepositoryV2 {
    constructor(
        private readonly inviteRemoteDataSource: IInviteRemoteDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public async list(filter: InviteListInput | null = null): Promise<MyInviteView[]> {
        return this.inviteRemoteDataSource.listInvites(filter);
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
}
