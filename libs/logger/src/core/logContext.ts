import type { LogContext } from './types';

const LOG_CONTEXT_FIELD_MAP: Record<keyof LogContext, true> = {
    runId: true,
    sid: true,
    uid: true,
    cid: true,
    appVersion: true,
    webVersion: true,
    route: true,
    os: true,
    osVersion: true,
    model: true,
    sessionId: true,
    platform: true,
    host: true,
    network: true,
    locale: true,
    routeTemplate: true,
    sessionOwner: true,
};

export const LOG_CONTEXT_FIELDS = Object.keys(LOG_CONTEXT_FIELD_MAP) as (keyof LogContext)[];

export const pickLogContext = (source: Partial<LogContext>): LogContext => {
    const picked: Record<string, string> = {};

    for (const field of LOG_CONTEXT_FIELDS) {
        const value = source[field];
        if (value !== undefined) picked[field] = value;
    }

    return picked as LogContext;
};
