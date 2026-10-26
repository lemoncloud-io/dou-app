import type { statsVersions as ko } from '../ko/statsVersions';

/** English copy for the statistics tab's version adoption view. */
export const statsVersions: typeof ko = {
    summary: {
        title: 'At a glance',
        hint: 'Everyone who left a record in this period, counted by the server. Logs count too, so older versions that send no statistics are included.',
        users: 'All users',
        usersSub: 'Records: {{n}}',
        coverage: 'App users who can send statistics',
        coverageSub: '{{eligible}} of {{total}} app users',
        coverageHelp:
            'Statistics are collected only from app 0.29.2 and later and from the browser web, so this is the share of app users the Statistics tab can see. It adds up users per version, so it is approximate.',
        noVersions: 'No records carry an app version — there may only have been browser web records.',
        newest: 'Newest app version',
        newestSince: 'First seen on {{day}}',
        newestFromStart: 'Present from the first day of the period',
        newestUsers: 'Users: {{n}}',
    },
    dim: {
        label: 'Split by',
        appVersion: 'App version',
        os: 'OS',
        model: 'Device model',
        webVersion: 'Web version',
    },
    dimInline: { appVersion: 'app version', os: 'OS', model: 'device model', webVersion: 'web version' },
    people: {
        title: 'Users by {{dim}}',
        hint: 'People counted per value. Someone who updated during the period is counted under both values, so the shares can add up past 100%.',
        barsLabel: 'Users by {{dim}}',
        usersShort: '{{n}}',
        records: 'Records: {{n}}',
        sendsStats: 'Sends statistics',
        sendsStatsHelp: 'Version 0.29.2 or later, which sends statistics',
        missing:
            'Shares are of all {{n}} users. Records without this value are in no row — the browser web, for example, has no app version.',
        more: 'Only the {{n}} values with the most records are shown.',
        empty: 'No records in this period carry a {{dim}}',
        emptyHint:
            'There may only have been records from places that do not send this value, such as the browser web. Try another split.',
    },
    adoption: {
        title: 'App version share by day',
        hint: 'Each day, the share the three versions with the most users took of the users summed across the versions checked. The sum adds users per version, so someone who updated that day counts twice, and versions not checked are left out.',
        day: 'Day',
        dayTotal: 'Users across checked versions',
        cell: '{{pct}} · {{n}}',
        empty: 'No app records to split by day',
    },
    wideSpan: 'The server counts whole days only, so the numbers here cover {{from}} 00:00 to {{to}}.',
    unsupported: 'The server does not aggregate this yet',
    unsupportedHint: 'Users per version need the server to count them. They will show here once the server is updated.',
};
