import { byEventAtAsc, eventAt } from './eventTime';
import type { ReportLogRow } from './parseReportLog';

export interface DeviceInfo {
    model?: string;
    os?: string;
    osVersion?: string;
    appVersion?: string;
    webVersion?: string;
    platform?: string;
}

export interface RunSummary {
    key: string;
    runId?: string;
    rows: ReportLogRow[];
    startAt?: number;
    endAt?: number;
    errors: number;
    warnings: number;
    reports: number;
    device: DeviceInfo;
}

export interface UserSummary {
    uid: string;
    name?: string;
    device: DeviceInfo;
    runs: number;
    errors: number;
    reports: number;
    lastSeenAt?: number;
    clouds: string[];
}

export const NO_RUN_KEY = 'no-run';

const REPORT_SLACK_MS = 2 * 60 * 1000;

const isError = (row: ReportLogRow): boolean =>
    row.type === 'error' || (row.type === 'log-entry' && row.level === 'error');

export const deviceOf = (rows: ReportLogRow[]): DeviceInfo => {
    const device: DeviceInfo = {};
    for (const row of [...rows].sort(byEventAtAsc)) {
        device.model = row.model ?? device.model;
        device.os = row.os ?? device.os;
        device.osVersion = row.osVersion ?? device.osVersion;
        device.appVersion = row.appVersion ?? device.appVersion;
        device.webVersion = row.webVersion ?? device.webVersion;
        device.platform = row.platform ?? device.platform;
    }
    return device;
};

const summarize = (key: string, runId: string | undefined, rows: ReportLogRow[]): RunSummary => {
    const ordered = [...rows].sort(byEventAtAsc);
    const times = ordered.map(eventAt).filter((ms): ms is number => ms !== undefined);
    return {
        key,
        runId,
        rows: ordered,
        startAt: times[0],
        endAt: times[times.length - 1],
        errors: ordered.filter(isError).length,
        warnings: ordered.filter(row => row.level === 'warn').length,
        reports: ordered.filter(row => row.type === 'issue').length,
        device: deviceOf(ordered),
    };
};

export const groupRuns = (rows: ReportLogRow[], reports: ReportLogRow[] = []): RunSummary[] => {
    const byRun = new Map<string, ReportLogRow[]>();
    for (const row of rows) {
        const key = row.runId || NO_RUN_KEY;
        const list = byRun.get(key);
        if (list) list.push(row);
        else byRun.set(key, [row]);
    }

    const spans = [...byRun.entries()]
        .filter(([key]) => key !== NO_RUN_KEY)
        .map(([key, list]) => {
            const times = list.map(eventAt).filter((ms): ms is number => ms !== undefined);
            return { key, start: Math.min(...times), end: Math.max(...times) };
        })
        .filter(span => Number.isFinite(span.start));

    const loose: ReportLogRow[] = [];
    for (const report of reports) {
        const at = eventAt(report);
        const home =
            at === undefined
                ? undefined
                : spans
                      .filter(span => at >= span.start - REPORT_SLACK_MS && at <= span.end + REPORT_SLACK_MS)
                      .sort((a, b) => distance(at, a) - distance(at, b))[0];
        if (home) byRun.get(home.key)?.push(report);
        else loose.push(report);
    }

    const runs = [...byRun.entries()].map(([key, list]) => summarize(key, key === NO_RUN_KEY ? undefined : key, list));
    for (const report of loose) runs.push(summarize(`report:${report.id}`, undefined, [report]));

    return runs.sort((a, b) => (b.endAt ?? -Infinity) - (a.endAt ?? -Infinity));
};

const distance = (at: number, span: { start: number; end: number }): number =>
    at < span.start ? span.start - at : at > span.end ? at - span.end : 0;

export const summarizeUser = (uid: string, rows: ReportLogRow[], reports: ReportLogRow[] = []): UserSummary => {
    const all = [...rows, ...reports];
    const times = all.map(eventAt).filter((ms): ms is number => ms !== undefined);
    return {
        uid,
        name: reports.find(report => report.userName)?.userName,
        device: deviceOf(rows.length ? rows : reports),
        runs: new Set(rows.map(row => row.runId).filter(Boolean)).size,
        errors: rows.filter(isError).length,
        reports: reports.length,
        lastSeenAt: times.length ? Math.max(...times) : undefined,
        clouds: [...new Set(rows.map(row => row.cid).filter((cid): cid is string => !!cid))].sort(),
    };
};

export interface RecentUser {
    uid: string;
    name?: string;
    lastSeenAt?: number;
    records: number;
    errors: number;
    device: DeviceInfo;
}

export const recentUsers = (rows: ReportLogRow[], query = '', limit = 50): RecentUser[] => {
    const byUser = new Map<string, ReportLogRow[]>();
    for (const row of rows) {
        if (!row.userId) continue;
        const list = byUser.get(row.userId);
        if (list) list.push(row);
        else byUser.set(row.userId, [row]);
    }
    const needle = query.trim().toLowerCase();
    return [...byUser.entries()]
        .map(([uid, list]): RecentUser => {
            const times = list.map(eventAt).filter((ms): ms is number => ms !== undefined);
            return {
                uid,
                name: list.find(row => row.userName)?.userName,
                lastSeenAt: times.length ? Math.max(...times) : undefined,
                records: list.length,
                errors: list.filter(isError).length,
                device: deviceOf(list),
            };
        })
        .filter(
            user => !needle || user.uid.toLowerCase().includes(needle) || !!user.name?.toLowerCase().includes(needle)
        )
        .sort((a, b) => (b.lastSeenAt ?? -Infinity) - (a.lastSeenAt ?? -Infinity))
        .slice(0, limit);
};

export const runAt = (runs: RunSummary[], at: number): RunSummary | undefined =>
    runs.find(
        run =>
            run.startAt !== undefined &&
            run.endAt !== undefined &&
            at >= run.startAt - REPORT_SLACK_MS &&
            at <= run.endAt + REPORT_SLACK_MS
    );

export interface CloudSeen {
    cid: string;
    name?: string;
    records: number;
}

export const cloudsOf = (rows: ReportLogRow[]): CloudSeen[] => {
    const seen = new Map<string, CloudSeen>();
    for (const row of rows) {
        const cid = row.cid ?? reportCloudOf(row);
        if (!cid) continue;
        const entry = seen.get(cid) ?? { cid, records: 0 };
        entry.records += 1;
        const cloud = row.payload?.cloud;
        if (!entry.name && cloud && typeof cloud.name === 'string' && cloud.name) entry.name = cloud.name;
        seen.set(cid, entry);
    }
    return [...seen.values()].sort((a, b) => b.records - a.records || a.cid.localeCompare(b.cid));
};

export const reportCloudOf = (row: ReportLogRow): string | undefined => {
    const id = row.payload?.cloud?.cloudId;
    return typeof id === 'string' && id ? id : (row.cid ?? undefined);
};
