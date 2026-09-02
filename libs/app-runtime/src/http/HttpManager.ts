import { logger } from '@chatic/bridges';
import { redactSensitive, truncate } from '@chatic/logger';
import { getDynamicRelayBackend, WEB_IAP_ENDPOINT, WEB_OAUTH_ENDPOINT } from '@chatic/web-config';
import {
    createHttpClient,
    type HttpClient,
    type HttpLogSink,
    type HttpRoute,
    type HttpRuntimePorts,
    type LemonRequestSurface,
    type NetworkLogFields,
} from '@chatic/http';

/**
 * `resolveEndpoint` default per route.
 *
 * There is no 'cloud' entry because there is no cloud route. A cloud backend is still a
 * destination — `exchange-token` and the invite lookups go to the host the delegation token names —
 * but those ride an explicit `baseURL` and are signed the RELAY way. Destination and signing are
 * independent; see `HttpRoute` in `@chatic/http`.
 */
const ENDPOINT_RESOLVERS: Record<HttpRoute, () => string> = {
    relay: getDynamicRelayBackend,
    oauth: () => WEB_OAUTH_ENDPOINT,
    iap: () => WEB_IAP_ENDPOINT,
};

/**
 * "Has this route's signing credential already lapsed?" — the one question `@chatic/http` cannot
 * answer for itself (the credentials live in `session/store`, which `http/**` must not import) and
 * cannot skip either: without it a signature rejection is indistinguishable from a network outage,
 * because the API Gateway 403 that carries it has no CORS header and never reaches the app as a
 * status. Still route-keyed to match the port, though relay is the only signed route today.
 */
export interface CredentialStalenessPort {
    isStale(route: HttpRoute): boolean;
    /**
     * Re-mints the route's credential and reports whether the request may be replayed. Paired with
     * `isStale` because they are two halves of one answer — detecting a lapsed credential is only
     * useful if something can act on it, and wiring one without the other leaves a diagnosis with no
     * treatment.
     */
    recover(route: HttpRoute): Promise<boolean>;
}

const createNetworkLogSink = (): HttpLogSink => {
    // Redact in place, key-by-key — `{...fields, responseData: ...}` would ADD a `responseData:
    // undefined` own key on the success path (where the lib deliberately omits it). Only touch keys
    // that already exist; see libs/web-core/src/transport/httpLogSink.ts for the same fix.
    const redactFields = (fields: NetworkLogFields): NetworkLogFields => {
        const result: NetworkLogFields = { ...fields };
        if ('params' in fields) result.params = truncate(redactSensitive(fields.params));
        if ('requestBody' in fields) result.requestBody = truncate(redactSensitive(fields.requestBody));
        if ('responseData' in fields) result.responseData = truncate(redactSensitive(fields.responseData));
        return result;
    };

    return {
        debug: (tag, message, fields) => logger.debug(tag, message, redactFields(fields)),
        warn: (tag, message, fields) => logger.warn(tag, message, redactFields(fields)),
        error: (tag, message, fields) => {
            const { error, ...rest } = fields;
            logger.error(tag, message, { error, data: redactFields(rest) });
        },
    };
};

/**
 * Reproduces the pre-lib `handleAuthError(error, true, message)` reaction inline — `app-runtime`
 * does not import `@chatic/web-core`'s `handleAuthError` because that function is scheduled to move
 * behind this same port when the web-core transport delegation lands (checklist item 7). Keeping
 * the reaction here now, rather than importing a function that is about to be re-homed, avoids a
 * throwaway cross-import.
 */
export const onAuthFailure = (error: unknown, message: string): void => {
    logger.error('AUTH', message, { error });
    if (typeof window !== 'undefined') {
        window.alert(`인증 오류: ${error instanceof Error ? error.message : String(error)}`);
        window.location.href = '/auth/logout';
    }
    throw error instanceof Error ? error : new Error(String(error));
};

/**
 * Assembles `HttpRuntimePorts` and hands back the `@chatic/http` client — the `SocketManager`
 * counterpart for HTTP (ADR-0070 결정 4). The staleness port is injected so this module imports
 * nothing from elsewhere in `app-runtime`; `http/factory.ts` is the one place that binds it to the
 * session stores.
 */
export const createHttpManager = (
    lemonSurface: LemonRequestSurface,
    // Optional so a test can build a manager without a session behind it; omitting it only costs the
    // failure ATTRIBUTION, never the request itself.
    credentials?: CredentialStalenessPort
): HttpClient => {
    const ports: HttpRuntimePorts = {
        resolveEndpoint: route => ENDPOINT_RESOLVERS[route](),
        isCredentialStale: credentials ? route => credentials.isStale(route) : undefined,
        recoverCredential: credentials ? route => credentials.recover(route) : undefined,
        logSink: createNetworkLogSink(),
        onAuthFailure,
    };

    return createHttpClient(lemonSurface, ports);
};
