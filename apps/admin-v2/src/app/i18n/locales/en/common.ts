import type { common as ko } from '../ko/common';

/** English copy shared across the console: the app nav, the page header, periods and common states. */
export const common: typeof ko = {
    nav: {
        brand: 'Admin V2',
        socketLab: 'Socket Lab',
        reportLogs: 'Log Console',
        users: 'Users',
        memberships: 'Memberships',
        cloudDeployments: 'Cloud Deployments',
    },
    language: { label: 'Language', ko: '한국어', en: 'English' },
    console: {
        title: 'Log Console',
        tabsLabel: 'What you came to do',
        copyLink: 'Copy link to this view',
        copied: 'Link copied',
        copyFailed: "Couldn't copy",
    },
    tabs: { user: 'Find a user', errors: 'Errors', reports: 'Issue reports', stats: 'Statistics', all: 'All logs' },
    stage: {
        label: 'Server',
        v1: 'Production',
        d1: 'Development',
        v1Hint: 'Production server — real users’ records',
        d1Hint: 'Development server — test records',
    },
    period: {
        label: 'Period',
        '1h': 'Last hour',
        '24h': 'Last 24 hours',
        today: 'Today',
        yesterday: 'Yesterday',
        '7d': 'Last 7 days',
        custom: 'Pick dates',
        around: '30 minutes either side of {{time}}',
        from: 'From',
        to: 'To',
        range: '{{from}} – {{to}}',
    },
    fetch: {
        loading: 'Loading…',
        failed: "Couldn't load: {{message}}",
        retry: 'Retry',
        partial: 'Showing only the newest {{n}} records. Narrow the period to see them all.',
    },
    empty: { noRecords: 'No records in this period', widen: 'Widen the period' },
    user: { anonymous: 'User {{id}}', unknown: 'Unknown user' },
    actions: { details: 'Details', openReport: 'Open report', logsAtThatTime: "See this user's logs at that time" },
    device: { app: 'App {{version}}', web: 'Web {{version}}' },
};
