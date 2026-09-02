import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { CloudBody, CloudVerifyEmailBody, CloudVerifyEmailView, CloudView } from '@lemoncloud/chatic-backend-api';
import type { HttpGatewayExecutor } from './types';

/** `/clouds/*` relay resource wire vocabulary. */
export interface CloudHttpGateway {
    /** GET {relay}/clouds/0/list?view=mine — `view: 'mine'` is fixed, not caller-chosen. */
    list(params?: Record<string, unknown>): Promise<ListResult<CloudView>>;
    /** PUT {relay}/clouds/{cloudId}. */
    update(cloudId: string, body: CloudBody): Promise<CloudView>;
    /** POST {relay}/clouds/0/make?auto=1 — `auto: 1` is fixed (unlike the membership route, `make`
     * defaults to `auto=0` and would create the record without enqueueing provisioning). */
    make(body: CloudBody, params?: Record<string, unknown>): Promise<CloudView>;
    /** POST {relay}/clouds/{cloudId}/release, `allowRecordError` — the response IS the released
     * record, and a cloud that failed provisioning keeps its trace in its own `error` column. */
    release(cloudId: string, params?: Record<string, unknown>): Promise<CloudView>;
    /** POST {relay}/clouds/0/verify-email?dryRun. */
    verifyEmail(body: CloudVerifyEmailBody, params?: { dryRun?: boolean }): Promise<CloudVerifyEmailView>;
}

export const createCloudHttpGateway = (exec: HttpGatewayExecutor): CloudHttpGateway => {
    const relay = () => exec.resolveEndpoint('relay');

    return {
        list: params =>
            exec.executeSignedRelayRequest<ListResult<CloudView>, never, Record<string, unknown> & { view: 'mine' }>({
                method: 'GET',
                baseURL: `${relay()}/clouds/0/list`,
                params: { ...params, view: 'mine' },
            }),

        update: (cloudId, body) =>
            exec.executeSignedRelayRequest<CloudView, CloudBody>({
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

        verifyEmail: (body, params) =>
            exec.executeSignedRelayRequest<CloudVerifyEmailView, CloudVerifyEmailBody, { dryRun?: boolean }>({
                method: 'POST',
                baseURL: `${relay()}/clouds/0/verify-email`,
                params: { ...params },
                body,
            }),
    };
};
