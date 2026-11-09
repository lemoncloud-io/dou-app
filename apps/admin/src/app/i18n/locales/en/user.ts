import type { user as ko } from '../ko/user';

/** English copy for the user-lookup tab. */
export const user: typeof ko = {
    search: {
        label: 'User ID',
        placeholder: 'Enter a user ID (names also match within the recent records)',
        submit: 'Find',
        clear: 'Find another user',
    },
    recent: {
        title: 'Users active in this period',
        hint: 'From the recent records fetched. Not listed? Type the user ID and press Find.',
        noMatch: 'No matching user in the fetched records',
        noMatchHint: "The server can't search by name or phone number yet. Try the exact user ID.",
        searchExact: 'Find ID "{{id}}"',
    },
    card: {
        lastSeen: 'Last record',
        runs: 'App sessions',
        errors: 'Errors',
        reports: 'Reports',
    },
    cloud: {
        label: 'Cloud',
        mixed: 'User numbers are assigned per cloud, so this ID has records from {{count}} clouds that may belong to different people. Pick a cloud to see one.',
        all: 'All clouds',
        one: 'Cloud {{id}}',
    },
    line: { error: 'Error', report: 'Report' },
    device: { app: 'App {{version}}', web: 'Web {{version}}', unknown: 'No device info' },
    runs: {
        title: 'App sessions: {{n}}',
        hint: 'One per app launch, newest first. Open a card to read what happened, in order.',
        verbose: 'Show detailed records',
        reportsPartial: 'Reports were matched within the newest {{n}} received in this period. Some may be missing.',
        openInAll: 'Open in All logs',
    },
    run: {
        title: '{{day}}, {{from}}–{{to}} KST',
        noRun: 'Records without a session',
        reportOnly: 'Report outside any session',
        duration: 'for {{duration}}',
        errors: 'Errors {{count}}',
        reports: 'Reports {{count}}',
        records: 'Records {{count}}',
        timelineLabel: 'Records in order',
        hidden: 'Detailed records hidden: {{count}}',
    },
    actions: { details: 'Details', openReport: 'Open report' },
    empty: {
        title: 'No records for this user in this period',
        hint: 'Check the user ID and the production/development server.',
    },
    sentence: {
        log: '{{area}} · {{message}}',
        report: 'Reported a problem: {{title}}',
        screenView: 'Opened the {{screen}} screen',
        sessionStart: 'Opened the app',
        sessionEnd: 'Left the app',
        sessionEndAfter: 'Left the app (after {{duration}})',
        timed: '{{name}} · took {{duration}}',
        timedWithOutcome: '{{name}} · took {{duration}} · {{outcome}}',
        event: '{{name}} {{detail}}',
    },
};
