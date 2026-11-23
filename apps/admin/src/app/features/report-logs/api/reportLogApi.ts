import { runtime } from '@chatic/runtime';

import { stageEndpoint, stageEndpointKey } from '../../../config/stageEndpoints';

export interface RawMockView {
    id?: string;
    name?: string;
    meta?: unknown;
    ns?: string;
    type?: string;
    stereo?: string;
    uid?: string;
    createdAt?: number;
    updatedAt?: number;
    level?: string;
    runId?: string;
    cid?: string;
    sid?: string;
    [key: string]: unknown;
}

export type AggrResult = Record<string, Record<string, number>>;

export interface StatsBucket {
    key: string;
    val: number;
}

export interface LogListStats {
    groups?: Record<string, StatsBucket[]>;
    trend?: Array<{ key: number; val: number; users?: number }>;
    users?: number;
}

export interface ReportLogListResponse {
    list?: RawMockView[];
    total?: number;
    page?: number;
    limit?: number;
    aggr?: AggrResult | AggrResult[];
    stats?: LogListStats;
}

export const STATS_GROUP_FIELDS = [
    'tag',
    'level',
    'appVersion',
    'webVersion',
    'route',
    'os',
    'osVersion',
    'model',
] as const;

export type StatsGroupField = (typeof STATS_GROUP_FIELDS)[number];

export type StatsInterval = 'hour' | 'day' | 'week';

export type ReportStage = 'v1' | 'd1';

export const reportLogBaseFor = (stage: ReportStage): string => stageEndpoint('archive', stage);

export const requireReportLogBase = (stage: ReportStage): string => {
    const base = reportLogBaseFor(stage);
    if (!base) throw new Error(`${stageEndpointKey('archive', stage)} is not set — no archive to read on ${stage}.`);
    return base;
};

export type ReportKind = 'all' | 'error' | 'issue' | 'log-entry';

export const STEREO_BY_KIND: Record<ReportKind, string | undefined> = {
    all: undefined,
    error: 'log',
    issue: 'issue',
    'log-entry': 'log',
};

export interface FetchReportLogsParams {
    page?: number;
    limit?: number;
    stage?: ReportStage;
    type?: string;
    from?: string;
    to?: string;
    level?: string;
    runId?: string;
    uid?: string;
    cid?: string;
    tag?: string;
    appVersion?: string;
    webVersion?: string;
    route?: string;
    os?: string;
    osVersion?: string;
    model?: string;
    groupBy?: readonly StatsGroupField[];
    aggrSize?: number;
    interval?: StatsInterval;
    users?: boolean;
}

export const ROUND_2_AXES = ['tag', 'appVersion', 'webVersion', 'route', 'os', 'osVersion', 'model'] as const;

export const buildReportLogListParams = ({
    page = 0,
    limit = 100,
    type,
    from,
    to,
    level,
    runId,
    uid,
    cid,
    groupBy,
    aggrSize,
    interval,
    users,
    ...rest
}: FetchReportLogsParams = {}): Record<string, string | number> => ({
    page,
    limit,
    ...(type ? { type } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(level ? { level } : {}),
    ...(runId ? { runId } : {}),
    ...(uid ? { uid } : {}),
    ...(cid ? { cid } : {}),
    ...Object.fromEntries(ROUND_2_AXES.flatMap(axis => (rest[axis] ? [[axis, rest[axis] as string]] : []))),
    ...(groupBy?.length ? { groupBy: groupBy.join(',') } : {}),
    ...(groupBy?.length && aggrSize ? { aggrSize } : {}),
    ...(interval ? { interval } : {}),
    ...(users ? { users: 1 } : {}),
});

export const fetchReportLogs = async ({
    stage = 'v1',
    ...params
}: FetchReportLogsParams = {}): Promise<ReportLogListResponse> => {
    const { data } = await runtime.boot.webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${requireReportLogBase(stage)}/mocks/0/list`,
        })
        .setParams(buildReportLogListParams(params))
        .execute<ReportLogListResponse>();
    return data ?? {};
};
