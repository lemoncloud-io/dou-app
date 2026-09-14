import type { InviteCreateInput, InviteListInput } from '@lemoncloud/chatic-sockets-lib';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { InviteSocketDomainGateway } from '../gateways';

/**
 * Invite view as `invite.get` returns it: the server also reports whether the reader must verify
 * their number before the code can be redeemed. The flag is response-only (never stored), so it
 * rides on the view rather than becoming a separate read.
 */
export type RelayInviteView = MyInviteView & { needVerify?: boolean };

/**
 * The paged envelope `invite.list` answers with, narrowed to what this data source reads.
 *
 * Declared here rather than imported: the backend package publishes only its view types at the
 * package root. Its `total` counts the PAGE rather than the collection, so it is dropped instead of
 * surfaced — paging means asking for the next page and stopping on an empty one, and a page count
 * masquerading as a total would only mislead callers.
 */
interface InviteListPage {
    list?: MyInviteView[];
}

export interface IInviteSocketDataSource {
    /** `invite.list` — the inviter's own invite cards. Returns the page contents, newest first. */
    listInvites(payload?: InviteListInput | null): Promise<MyInviteView[]>;
    /** `invite.create` — issue a number-bound invite code. */
    createInvite(payload: InviteCreateInput): Promise<MyInviteView>;
    /** `invite.get` — inspect whether a code is still usable. Expiry arrives as `state`, not as an error. */
    getInvite(code: string): Promise<RelayInviteView>;
    /** `invite.accept` — redeem a code. Idempotent server-side; success is `state === 'accepted'`. */
    acceptInvite(code: string): Promise<MyInviteView>;
    /**
     * `invite.cancel` — the inviter retires their own invite. Authorization is session ownership,
     * not the code (someone else's invite is a 403). Idempotent on already-final invites; an
     * accepted one is a 409. Success is `state === 'canceled'`.
     */
    cancelInvite(code: string): Promise<MyInviteView>;
    /**
     * `invite.reject` — the recipient declines. Possession of the code is enough (no phone
     * verification). Idempotent; an accepted one is a 409. Success is `state === 'rejected'`.
     */
    rejectInvite(code: string): Promise<MyInviteView>;
}

/**
 * Relay 1:1 (DM) invite source. The gateway handed in is already pinned to the RELAY slot by the
 * composition root (ADR-0033): the invite domain lives in the central backend behind the relay, so
 * it must not follow the active slot into a cloud. No route parameter is exposed here for the same
 * reason `device.update-remote` exposes none — a route no caller may vary is only a leak waiting to
 * happen.
 *
 * The code is a credential, not an identifier: it travels in the packet body only, and never into a
 * log, a cache key, or a URL other than the deeplink the server puts on the view.
 */
export class InviteSocketDataSource implements IInviteSocketDataSource {
    constructor(private readonly gateway: InviteSocketDomainGateway) {}

    public async listInvites(payload: InviteListInput | null = null): Promise<MyInviteView[]> {
        const page = await this.gateway.list<InviteListPage>(payload);
        return page?.list ?? [];
    }

    public async createInvite(payload: InviteCreateInput): Promise<MyInviteView> {
        return this.gateway.create<MyInviteView>(payload);
    }

    public async getInvite(code: string): Promise<RelayInviteView> {
        return this.gateway.get<RelayInviteView>({ code });
    }

    public async acceptInvite(code: string): Promise<MyInviteView> {
        return this.gateway.accept<MyInviteView>({ code });
    }

    public async cancelInvite(code: string): Promise<MyInviteView> {
        return this.gateway.cancel<MyInviteView>({ code });
    }

    public async rejectInvite(code: string): Promise<MyInviteView> {
        return this.gateway.reject<MyInviteView>({ code });
    }
}
