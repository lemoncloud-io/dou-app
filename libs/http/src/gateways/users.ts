import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { RegisterDeviceTokenBody, UserProfile$, UserView } from '@lemoncloud/chatic-backend-api';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type { AdminEndpointOptions } from './subscriptions';
import type { HttpGatewayExecutor } from './types';

export interface UserHttpGateway {
    list(params?: Record<string, unknown>, options?: AdminEndpointOptions): Promise<ListResult<UserView>>;
    tryProfile(): Promise<UserProfile$>;
    updateProfile(uid: string, body: Record<string, unknown>): Promise<UserProfile$>;
    registerDevice(body: RegisterDeviceTokenBody, opts?: { force?: boolean }): Promise<RegisterDeviceResult>;
}

export const createUserHttpGateway = (exec: HttpGatewayExecutor): UserHttpGateway => {
    const relay = () => exec.resolveEndpoint('relay');
    const oauth = () => exec.resolveEndpoint('oauth');

    return {
        list: (params, options) =>
            exec.executeSignedRelayRequest<ListResult<UserView>, never, Record<string, unknown>>({
                method: 'GET',
                baseURL: `${options?.endpoint || relay()}/hello/user/list`,
                params: { ...params },
            }),

        tryProfile: () =>
            exec.executeSignedRelayRequest<UserProfile$>({
                method: 'GET',
                baseURL: `${oauth()}/users/0/profile`,
            }),

        updateProfile: (uid, body) =>
            exec.executeSignedRelayRequest<UserProfile$>({
                method: 'PUT',
                baseURL: `${relay()}/users/${uid}`,
                body,
            }),

        registerDevice: (body, opts) =>
            exec.executeSignedRelayRequest<RegisterDeviceResult, RegisterDeviceTokenBody, { force?: string }>({
                method: 'POST',
                baseURL: `${relay()}/users/0/reg-dev`,
                params: opts?.force ? { force: 'true' } : undefined,
                body,
            }),
    };
};
