import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { HttpGatewayExecutor } from './types';

export type RelayMiniAppUse = 'on' | 'off';

export type RelayMiniAppStatus = 'active' | 'inactive' | 'held';

export interface RelayMiniAppView {
    id: string;
    name?: string;
    url?: string;
    state$?: { use?: RelayMiniAppUse; hold?: string };
    status?: RelayMiniAppStatus;
}

export interface RelayMiniAppCreateBody {
    cloudId: string;
    name: string;
    url: string;
    state$?: { use: RelayMiniAppUse };
}

export interface RelayMiniAppUpdateBody {
    name?: string;
    url?: string;
    state$?: { use: RelayMiniAppUse };
}

export interface MiniAppHttpGateway {
    list(cloudId: string): Promise<ListResult<RelayMiniAppView>>;
    create(body: RelayMiniAppCreateBody): Promise<RelayMiniAppView>;
    update(id: string, body: RelayMiniAppUpdateBody): Promise<RelayMiniAppView>;
    remove(id: string): Promise<RelayMiniAppView>;
}

export const createMiniAppHttpGateway = (exec: HttpGatewayExecutor): MiniAppHttpGateway => {
    const relay = () => exec.resolveEndpoint('relay');

    return {
        list: cloudId =>
            exec.executeSignedRelayRequest<ListResult<RelayMiniAppView>>({
                method: 'GET',
                baseURL: `${relay()}/miniapps/${cloudId}/list`,
            }),

        create: body =>
            exec.executeSignedRelayRequest<RelayMiniAppView, RelayMiniAppCreateBody>({
                method: 'POST',
                baseURL: `${relay()}/miniapps/0`,
                body,
            }),

        update: (id, body) =>
            exec.executeSignedRelayRequest<RelayMiniAppView, RelayMiniAppUpdateBody>({
                method: 'PUT',
                baseURL: `${relay()}/miniapps/${id}`,
                body,
            }),

        remove: id =>
            exec.executeSignedRelayRequest<RelayMiniAppView, Record<string, never>>({
                method: 'DELETE',
                baseURL: `${relay()}/miniapps/${id}`,
                body: {},
            }),
    };
};
