import type { errors as ko } from '../ko/errors';

/** English copy for the errors tab. */
export const errors: typeof ko = {
    summary: {
        count: 'Errors',
        users: 'Users affected',
        incidents: 'Incident types',
        trendLabel: 'Errors over time',
    },
    source: {
        rows: 'Every error in this period was fetched and counted.',
        rowsPartial: "The server didn't return counts, so only the newest {{n}} were counted. There may be more.",
        server: 'Counts and users are the server’s totals for the whole period. Per-incident users and first/last times come from the recent records fetched.',
        serverWide:
            'The server counts whole days only, so counts and users cover {{from}} 00:00 to {{to}}. Per-incident users and first/last times come from the recent records fetched.',
    },
    group: {
        title: 'Errors by incident',
        hint: 'Errors of the same kind grouped together, most frequent first. Open one to see its cases.',
        count: '{{n}} times',
        users: '{{n}} users',
        usersAtLeast: '{{n}}+ users',
        first: 'First',
        last: 'Last',
        sparkLabel: 'Occurrences across the period',
    },
    cases: {
        title: 'Cases',
        hint: 'Newest first. Follow a user to see what else happened to them at the time.',
        rawTag: 'Raw tag',
        back: 'Back to incidents',
        empty: 'No cases of this incident in this period',
        userTimeline: "This user's records at the time",
    },
    empty: {
        title: 'No errors in this period',
        hint: 'Check that you are on the right server, too.',
    },
};
