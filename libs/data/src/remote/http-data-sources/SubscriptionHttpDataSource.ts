import type { AggrResult, ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type {
    CloudView,
    CreateMembershipBody,
    MembershipBody,
    MembershipView,
    ProductView,
} from '@lemoncloud/chatic-backend-api';
import type { SubscriptionHttpDomainGateway } from '../gateways';

export interface ISubscriptionHttpDataSource {
    fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>>;
    fetchMembershipInfo(): Promise<MembershipView>;
    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView>;

    fetchAdminMemberships(
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<MembershipView>>;
    updateMembershipByAdmin(userId: string, body: MembershipBody, opts?: AdminOverrideOptions): Promise<MembershipView>;
    fetchAdminClouds(
        ownerId: string,
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<CloudView, AggrResult>>;
}

/**
 * Aims one call at a relay other than the configured one — the console's stage switch.
 *
 * Only the admin calls accept it. The app's own calls must never leave the relay they were
 * authenticated against, so this is opt-in per call rather than a mode on the client.
 */
export interface AdminEndpointOptions {
    /** Full relay base, e.g. `https://api.example.com/v1`. */
    endpoint?: string;
}

/** `auto` provisions clouds up to the raised quota immediately. Off unless the operator asks. */
export interface AdminOverrideOptions extends AdminEndpointOptions {
    auto?: boolean;
}

/**
 * Remote-only source — no local data source, same shape as `AuthHttpDataSource`/
 * `DeviceSocketDataSource`. No domain model exists for this axis yet; views pass through
 * unchanged (alias-level, matching the precedent most existing domain models already follow —
 * see libs/data/docs/remote/http.md#httpdatasource-and-cache-semantics). A real `DomainProduct` /
 * `DomainMembership` mapping is future work, not this data source's job to invent.
 *
 * The admin console's reads (ADR-0101) land here too, `fetchAdminClouds` included — even though
 * clouds have their own repository. That one maps views through `toDomainCloud(view, context)`
 * using the CURRENT session's context, and `resolveCloudType` then labels ownership relative to
 * the viewer. Every row an admin lists belongs to somebody else, so that classification would be
 * quietly wrong. Passing through here keeps the views raw, and keeps `aggr` — which the domain
 * list result drops — intact.
 */
export class SubscriptionHttpDataSource implements ISubscriptionHttpDataSource {
    constructor(private readonly gateway: SubscriptionHttpDomainGateway) {}

    fetchPlans(params?: Record<string, unknown>): Promise<ListResult<ProductView>> {
        return this.gateway.plans(params);
    }

    fetchMembershipInfo(): Promise<MembershipView> {
        return this.gateway.membership();
    }

    validateMembership(body: CreateMembershipBody, params?: Record<string, unknown>): Promise<MembershipView> {
        return this.gateway.validateMembership(body, params);
    }

    fetchAdminMemberships(
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<MembershipView>> {
        return this.gateway.adminMemberships(params, opts);
    }

    // The `1`/absent encoding is the wire's, so it stays here rather than in a caller — same as
    // `CloudHttpDataSource.makeCloud`'s `dryRun`. The console asks for `auto: true`.
    updateMembershipByAdmin(
        userId: string,
        body: MembershipBody,
        opts?: AdminOverrideOptions
    ): Promise<MembershipView> {
        return this.gateway.updateMembershipByAdmin(userId, body, opts?.auto ? { auto: 1 } : undefined, {
            endpoint: opts?.endpoint,
        });
    }

    fetchAdminClouds(
        ownerId: string,
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<ListResult<CloudView, AggrResult>> {
        return this.gateway.adminClouds(ownerId, params, opts);
    }
}
