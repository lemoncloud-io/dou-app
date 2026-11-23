import { toBlocks, type KnownBlock } from '@chatic/block-kit';

interface BuilderTemplate {
    id: 'error' | 'attendance' | 'deployment';
    label: string;
    dotClass: string;
    blocks: KnownBlock[];
}

const ERROR_BLOCKS = [
    { type: 'header', text: { type: 'plain_text', text: '🔴 503 Service Unavailable' } },
    { type: 'section', text: { type: 'mrkdwn', text: '`ECONNRESET` — socket hang up while proxying to the pool.' } },
    {
        type: 'section',
        fields: [
            { type: 'mrkdwn', text: '*Service*\ncarrot-pools2-api' },
            { type: 'mrkdwn', text: '*Environment*\nlemon-production' },
            { type: 'mrkdwn', text: '*Version*\n1.25.1201' },
            { type: 'mrkdwn', text: '*First seen*\n23:11 KST' },
        ],
    },
    { type: 'divider' },
    {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: '```Error: socket hang up\n    at connResetException (node:internal/errors:720:14)\n    at Socket.socketCloseListener (node:_http_client:474:25)\n    at Socket.emit (node:events:529:35)\n    at Socket.emit (node:domain:489:12)\n    at TCP.&lt;anonymous&gt; (node:net:350:12)```',
        },
    },
    {
        type: 'context',
        elements: [
            { type: 'mrkdwn', text: 'hello-alarm' },
            { type: 'mrkdwn', text: '<https://example.com/errors/ECONNRESET|Full report>' },
        ],
    },
];

const ATTENDANCE_BLOCKS = [
    { type: 'header', text: { type: 'plain_text', text: "🟢 Today's Attendance · 2026.08.28" } },
    { type: 'section', text: { type: 'mrkdwn', text: '*1 person* is out today.' } },
    {
        type: 'section',
        fields: [
            { type: 'mrkdwn', text: '*Alex Park*\nAnnual leave · All day' },
            { type: 'mrkdwn', text: '*Covering*\nSam Lee' },
        ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'ScheduleApp' }] },
];

const DEPLOYMENT_BLOCKS = [
    { type: 'header', text: { type: 'plain_text', text: '🟢 Flows v0.73.0 deployment complete' } },
    {
        type: 'section',
        text: { type: 'mrkdwn', text: 'Deployed to the *development server*. Took 2 minutes 41 seconds.' },
    },
    { type: 'divider' },
    {
        type: 'section',
        fields: [
            { type: 'mrkdwn', text: '*Deployed at*\n2026.08.25 16:11:51' },
            {
                type: 'mrkdwn',
                text: '*Commit*\n<https://github.com/example-org/example-app/commit/7b186ab|7b186ab> by octocat',
            },
        ],
    },
    {
        type: 'context',
        elements: [
            { type: 'mrkdwn', text: 'ReleaseBot' },
            { type: 'mrkdwn', text: '<https://github.com/example-org/example-app/actions|Actions run>' },
        ],
    },
];

export const TEMPLATES: readonly BuilderTemplate[] = [
    { id: 'error', label: 'Error', dotClass: 'bg-red-500', blocks: toBlocks(ERROR_BLOCKS) },
    { id: 'attendance', label: 'Attendance', dotClass: 'bg-emerald-600', blocks: toBlocks(ATTENDANCE_BLOCKS) },
    { id: 'deployment', label: 'Deployment', dotClass: 'bg-indigo-500', blocks: toBlocks(DEPLOYMENT_BLOCKS) },
] as const;
