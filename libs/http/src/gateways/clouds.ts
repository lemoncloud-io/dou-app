import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { CloudBody, CloudVerifyEmailBody, CloudVerifyEmailView, CloudView } from '@lemoncloud/chatic-backend-api';
import type { HttpGatewayExecutor } from './types';

export type RelayCloudView = CloudView & { miniAppUrl?: string };
export type RelayCloudBody = CloudBody & { miniAppUrl?: string };

export interface CloudHttpGateway {
    get(cloudId: string): Promise<RelayCloudView>;
    list(params?: Record<string, unknown>): Promise<ListResult<CloudView>>;
    update(cloudId: string, body: RelayCloudBody): Promise<RelayCloudView>;
    make(body: CloudBody, params?: Record<string, unknown>): Promise<CloudView>;
    release(cloudId: string, params?: Record<string, unknown>): Promise<CloudView>;
    workspace(cloudId: string): Promise<CloudView>;
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
