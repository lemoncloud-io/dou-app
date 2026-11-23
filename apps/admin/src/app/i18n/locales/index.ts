import { allLogs as allLogsEn } from './en/allLogs';
import { common as commonEn } from './en/common';
import { errors as errorsEn } from './en/errors';
import { events as eventsEn } from './en/events';
import { reports as reportsEn } from './en/reports';
import { statsPerf as statsPerfEn } from './en/statsPerf';
import { statsUsage as statsUsageEn } from './en/statsUsage';
import { statsDetail as statsDetailEn } from './en/statsDetail';
import { statsVersions as statsVersionsEn } from './en/statsVersions';
import { stats as statsEn } from './en/stats';
import { user as userEn } from './en/user';
import { allLogs as allLogsKo } from './ko/allLogs';
import { common as commonKo } from './ko/common';
import { errors as errorsKo } from './ko/errors';
import { events as eventsKo } from './ko/events';
import { reports as reportsKo } from './ko/reports';
import { statsPerf as statsPerfKo } from './ko/statsPerf';
import { statsUsage as statsUsageKo } from './ko/statsUsage';
import { statsDetail as statsDetailKo } from './ko/statsDetail';
import { statsVersions as statsVersionsKo } from './ko/statsVersions';
import { stats as statsKo } from './ko/stats';
import { user as userKo } from './ko/user';

export const NAMESPACES = [
    'common',
    'user',
    'errors',
    'reports',
    'stats',
    'statsPerf',
    'statsUsage',
    'statsDetail',
    'statsVersions',
    'allLogs',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
    ko: {
        common: commonKo,
        user: userKo,
        errors: errorsKo,
        reports: reportsKo,
        stats: statsKo,
        statsPerf: statsPerfKo,
        statsUsage: statsUsageKo,
        statsDetail: statsDetailKo,
        statsVersions: statsVersionsKo,
        allLogs: allLogsKo,
    },
    en: {
        common: commonEn,
        user: userEn,
        errors: errorsEn,
        reports: reportsEn,
        stats: statsEn,
        statsPerf: statsPerfEn,
        statsUsage: statsUsageEn,
        statsDetail: statsDetailEn,
        statsVersions: statsVersionsEn,
        allLogs: allLogsEn,
    },
} as const;

export const EVENT_NAMES = { ko: eventsKo, en: eventsEn } as const;
