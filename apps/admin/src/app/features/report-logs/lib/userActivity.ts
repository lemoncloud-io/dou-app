/**
 * `lib/report-logs/userActivity.ts`
 * - One user's records, shaped the way support asks about them: who is this, on what device, and
 *   what happened each time they opened the app.
 *
 * "Each time they opened the app" is a run: every record carries the `runId` of the app process
 * that wrote it, so grouping by it turns a pile of rows into visits. Issue reports carry no run —
 * they are written by a different path that stamps neither `runId` nor a top-level `uid` — so a
 * report is placed in the run that was going on when it was sent, and stands alone when none was.
 */
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
    /** Stable key for React and the URL: the run id, or a marker for rows without one. */
    key: string;
    runId?: string;
    /** Oldest first — a run is read in order. */
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
    /** From an issue report, the only record that carries a name. */
    name?: string;
    device: DeviceInfo;
    runs: number;
    errors: number;
    reports: number;
    lastSeenAt?: number;
    /** Distinct clouds the records came from. A uid is per cloud, so more than one means several people. */
    clouds: string[];
}

/** Records without a run id share one group; reports outside every run get one each. */
export const NO_RUN_KEY = 'no-run';

/** How far outside a run's first and last record a report still counts as sent during it. */
const REPORT_SLACK_MS = 2 * 60 * 1000;

const isError = (row: ReportLogRow): boolean =>
    row.type === 'error' || (row.type === 'log-entry' && row.level === 'error');

/** The newest value of each device field, so a run that updated mid-way shows where it ended. */
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

/**
 * Group a user's records into runs, newest run first, with their reports placed in.
 */
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
                      // The closest run, measured to its nearest edge, when runs overlap.
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

/** The user card. `rows` are the user's records, `reports` their issue reports. */
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

/**
 * Users seen in the fetched records, most recent first, narrowed by a search over the id and the
 * name. This is the "search within what was fetched" half of finding a user; an exact id goes to
 * the server instead.
 */
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

/** The run that holds an instant, for opening the right card when arriving from a report. */
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
    /** The cloud's name, when an issue report from it carried one. */
    name?: string;
    records: number;
}

/** Clouds a user's records came from, the busiest first. */
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

/** The cloud an issue report was sent from — inside the report, since reports carry no top-level `cid`. */
export const reportCloudOf = (row: ReportLogRow): string | undefined => {
    const id = row.payload?.cloud?.cloudId;
    return typeof id === 'string' && id ? id : (row.cid ?? undefined);
};
