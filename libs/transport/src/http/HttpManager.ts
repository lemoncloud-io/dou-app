import { config } from '@chatic/config';
import { logger, recordTelemetry, redactSensitive, truncate } from '@chatic/logger';
import {
    apiBackendOf,
    createHttpClient,
    createPerMinuteCap,
    toApiRequestSample,
    type HttpClient,
    type HttpLogSink,
    type HttpRoute,
    type HttpRuntimePorts,
    type RequestSurface,
    type NetworkLogFields,
} from '@chatic/http';

import { authFailureReaction } from './authFailureReaction';

const ENDPOINT_RESOLVERS: Record<HttpRoute, () => string> = {
    relay: () => config.get<string>('net.relay.backend') ?? '',
    oauth: () => config.get<string>('net.oauth.endpoint') ?? '',
    iap: () => config.get<string>('net.iap.endpoint') ?? '',
};

export interface CredentialStalenessPort {
    isStale(route: HttpRoute): boolean;
    recover(route: HttpRoute): Promise<boolean>;
}

export const API_REQUEST_SAMPLES_PER_MINUTE = 10;

const createNetworkLogSink = (): HttpLogSink => {
    const apiRequestCap = createPerMinuteCap(API_REQUEST_SAMPLES_PER_MINUTE);
    const measure = (fields: NetworkLogFields): void => {
        try {
            if (!apiRequestCap()) return;
            const backend = apiBackendOf(fields.url, {
                relay: ENDPOINT_RESOLVERS.relay(),
                others: [ENDPOINT_RESOLVERS.oauth(), ENDPOINT_RESOLVERS.iap()],
            });
            recordTelemetry('sample', 'api_request', toApiRequestSample(fields, backend));
        } catch {
            /* the measurement is lost, the request is not */
        }
    };

    const redactFields = (fields: NetworkLogFields): NetworkLogFields => {
        const { responseBytes: _bytes, ...logged } = fields;
        const result: NetworkLogFields = { ...logged };
        if ('params' in fields) result.params = truncate(redactSensitive(fields.params));
        if ('requestBody' in fields) result.requestBody = truncate(redactSensitive(fields.requestBody));
        if ('responseData' in fields) result.responseData = truncate(redactSensitive(fields.responseData));
        return result;
    };

    return {
        debug: (tag, message, fields) => {
            measure(fields);
            logger.debug(tag, message, redactFields(fields));
        },
        warn: (tag, message, fields) => {
            measure(fields);
            logger.warn(tag, message, redactFields(fields));
        },
        error: (tag, message, fields) => {
            const { error, ...rest } = fields;
            measure(rest);
            const errorCode = rest.errorCode !== String(rest.status) ? rest.errorCode : undefined;
            logger.error(tag, message, { error, data: redactFields(rest), httpStatus: rest.status, errorCode });
        },
    };
};

export const onAuthFailure = (error: unknown, message: string): void => {
    logger.error('AUTH', message, { error });
    authFailureReaction.react(error, message);
    throw error instanceof Error ? error : new Error(String(error));
};

export const createHttpManager = (
    requestSurface: RequestSurface,
    credentials?: CredentialStalenessPort
): HttpClient => {
    const ports: HttpRuntimePorts = {
        resolveEndpoint: route => ENDPOINT_RESOLVERS[route](),
        isCredentialStale: credentials ? route => credentials.isStale(route) : undefined,
        recoverCredential: credentials ? route => credentials.recover(route) : undefined,
        logSink: createNetworkLogSink(),
        onAuthFailure,
    };

    return createHttpClient(requestSurface, ports);
};
