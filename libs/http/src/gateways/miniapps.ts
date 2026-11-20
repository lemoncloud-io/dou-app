import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { HttpGatewayExecutor } from './types';

/**
 * The relay's mini app wire vocabulary. The backend types this app is pinned to were published before
 * the relay added mini apps, so the view and the two bodies are declared here — the same call as
 * `RelayCloudView` in `clouds.ts`, rather than moving to the next major of those types. Only the fields
 * the app reads or sends are declared. On the day the pinned types carry mini apps, these become
 * aliases of the package's types.
 */

/** The owner's on/off switch for one mini app. */
export type RelayMiniAppUse = 'on' | 'off';

/**
 * The relay's display value, derived from the owner's switch and the admin hold: `held` whenever an
 * admin holds it (whatever the switch says), else `inactive` when the owner turned it off, else `active`.
 */
export type RelayMiniAppStatus = 'active' | 'inactive' | 'held';

export interface RelayMiniAppView {
    id: string;
    name?: string;
    url?: string;
    state$?: { use?: RelayMiniAppUse; hold?: string };
    status?: RelayMiniAppStatus;
}

/**
 * The bodies carry no `hold` on purpose: the relay refuses (403) a non-admin body in which the
 * `state$.hold` key merely exists, whatever its value, so an owner's request must have no way to carry it.
 */
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

/** `/miniapps/*` relay resource. Every call is signed, including the list the relay also serves without a session. */
export interface MiniAppHttpGateway {
    /**
     * GET {relay}/miniapps/{cloudId}/list — in the order they were added. `page` and `limit` are not
     * sent: a cloud holds at most 10, which is also the relay's default page size. Two adds racing past
     * the cap can leave 11, and the eleventh is then not in this list — a relay limit, left as it is.
     */
    list(cloudId: string): Promise<ListResult<RelayMiniAppView>>;
    /** POST {relay}/miniapps/0 — the cloud's owner (or an admin). */
    create(body: RelayMiniAppCreateBody): Promise<RelayMiniAppView>;
    /** PUT {relay}/miniapps/{id} — only the fields in the body change. */
    update(id: string, body: RelayMiniAppUpdateBody): Promise<RelayMiniAppView>;
    /**
     * DELETE {relay}/miniapps/{id} — a soft delete; `destroy` is not sent (the relay takes it only locally).
     * The body is `{}` on purpose: the request is signed as if it carried `{}`, and a DELETE sent with
     * no body at all fails the relay gateway's signature check — a refusal that reaches a browser
     * without CORS headers, so as a bare network error.
     */
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
