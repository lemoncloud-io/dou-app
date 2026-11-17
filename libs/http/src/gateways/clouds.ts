import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { CloudBody, CloudVerifyEmailBody, CloudVerifyEmailView, CloudView } from '@lemoncloud/chatic-backend-api';
import type { HttpGatewayExecutor } from './types';

/**
 * The relay's cloud view and body with the owner's mini app link. The relay added `miniAppUrl` after
 * the backend types this app is pinned to were published, so the one field is declared here rather
 * than by moving to the next major of those types. A cloud with no link has none, or `''`.
 */
export type RelayCloudView = CloudView & { miniAppUrl?: string };
export type RelayCloudBody = CloudBody & { miniAppUrl?: string };

/** `/clouds/*` relay resource wire vocabulary. */
export interface CloudHttpGateway {
    /**
     * GET {relay}/clouds/{cloudId}. The owner (or an admin) gets the full view; anyone else, a session or
     * none, gets the minimal one — id, name, status and `miniAppUrl`.
     */
    get(cloudId: string): Promise<RelayCloudView>;
    /** GET {relay}/clouds/0/list?view=mine — `view: 'mine'` is fixed, not caller-chosen. */
    list(params?: Record<string, unknown>): Promise<ListResult<CloudView>>;
    /**
     * PUT {relay}/clouds/{cloudId}. An admin's body is taken as sent; the cloud's owner may change
     * `miniAppUrl` alone (anything else in the body is dropped); anyone else is refused (403).
     */
    update(cloudId: string, body: RelayCloudBody): Promise<RelayCloudView>;
    /** POST {relay}/clouds/0/make?auto=1 — `auto: 1` is fixed (unlike the membership route, `make`
     * defaults to `auto=0` and would create the record without enqueueing provisioning). */
    make(body: CloudBody, params?: Record<string, unknown>): Promise<CloudView>;
    /** POST {relay}/clouds/{cloudId}/release, `allowRecordError` — the response IS the released
     * record, and a cloud that failed provisioning keeps its trace in its own `error` column. */
    release(cloudId: string, params?: Record<string, unknown>): Promise<CloudView>;
    /** POST {relay}/clouds/{cloudId}/workspace — asks for a workspace slot again. The relay takes it
     * only for a cloud still in `init` or `error`, from its owner (or an admin). A slot request that
     * fails comes back as a record carrying `error`, which is rejected like any other API error —
     * unlike `release`, the caller has nothing to read from a failed retry. */
    workspace(cloudId: string): Promise<CloudView>;
    /** POST {relay}/clouds/0/verify-email?dryRun. */
    verifyEmail(body: CloudVerifyEmailBody, params?: { dryRun?: boolean }): Promise<CloudVerifyEmailView>;
}

export const createCloudHttpGateway = (exec: HttpGatewayExecutor): CloudHttpGateway => {
    const relay = () => exec.resolveEndpoint('relay');

    return {
        get: cloudId =>
            exec.executeSignedRelayRequest<RelayCloudView>({
                method: 'GET',
                baseURL: `${relay()}/clouds/${cloudId}`,
            }),

        list: params =>
            exec.executeSignedRelayRequest<ListResult<CloudView>, never, Record<string, unknown> & { view: 'mine' }>({
                method: 'GET',
                baseURL: `${relay()}/clouds/0/list`,
                params: { ...params, view: 'mine' },
            }),

        update: (cloudId, body) =>
            exec.executeSignedRelayRequest<RelayCloudView, RelayCloudBody>({
                method: 'PUT',
                baseURL: `${relay()}/clouds/${cloudId}`,
                body,
            }),

        make: (body, params) =>
            exec.executeSignedRelayRequest<CloudView, CloudBody, Record<string, unknown>>({
                method: 'POST',
                baseURL: `${relay()}/clouds/0/make`,
                params: { auto: 1, ...params },
                body,
            }),

        release: (cloudId, params) =>
            exec.executeSignedRelayRequest<CloudView, Record<string, never>, Record<string, unknown>>({
                method: 'POST',
                baseURL: `${relay()}/clouds/${cloudId}/release`,
                body: {},
                params: { ...params },
                allowRecordError: true,
            }),

        workspace: cloudId =>
            exec.executeSignedRelayRequest<CloudView, Record<string, never>>({
                method: 'POST',
                baseURL: `${relay()}/clouds/${cloudId}/workspace`,
                body: {},
            }),

        verifyEmail: (body, params) =>
            exec.executeSignedRelayRequest<CloudVerifyEmailView, CloudVerifyEmailBody, { dryRun?: boolean }>({
                method: 'POST',
                baseURL: `${relay()}/clouds/0/verify-email`,
                params: { ...params },
                body,
            }),
    };
};
