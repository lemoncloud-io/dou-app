import type { reports as ko } from '../ko/reports';

/** English copy for the issue-reports tab. */
export const reports: typeof ko = {
    search: { label: 'Search reports', placeholder: 'Search title, text or user' },
    inbox: { label: 'Received reports', attachments: 'Attachments: {{count}}' },
    empty: { title: 'No reports in this period', noMatch: 'No reports match the search' },
    detail: {
        badge: 'Issue report',
        pick: 'Pick a report on the left',
        back: 'Back to reports',
        user: 'From',
        app: 'App',
        device: 'Device',
        screen: 'Screen they were on',
        body: 'Message',
        screenshots: 'Screenshots ({{count}})',
        screenshotAlt: 'Screenshot {{index}}',
        openImage: 'Open the original in a new tab',
        developer: 'Developer details',
        noUser: 'This report has no user ID',
        notFound: "Couldn't find this report in the period",
        notFoundHint: 'Widen the period or check the server.',
    },
};
