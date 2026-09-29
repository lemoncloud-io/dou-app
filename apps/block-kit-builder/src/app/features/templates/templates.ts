import { toBlocks, type KnownBlock } from '@chatic/block-kit';

interface BuilderTemplate {
    id: 'error' | 'attendance' | 'deployment';
    label: string;
    /** A dot in the rail, so the three read as a set rather than a list of words. */
    dotClass: string;
    blocks: KnownBlock[];
}

/**
 * Status reads as an emoji in the header, not a coloured chip: that is what the
 * server does with an attachment's colour, and a chip would be a shape no message
 * can carry.
 *
 * The error the server sends today puts its whole JSON payload in one running
 * paragraph, which is why an error report is the hardest of these to read in a
 * channel. This one keeps the same information and gives it somewhere to go: the
 * failure is the heading, the service that failed is a field grid, and the stack
 * is a code block instead of prose. The payload it produces is still the four
 * blocks the contract allows — the difference is arrangement, not capability.
 */
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
            // Six lines, which is the design's trace and the length at which the
            // renderer folds one. A four-line stand-in would have shown a fence the
            // reader never meets — real traces are this long or longer.
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

/**
 * A daily roster. Short enough that a divider would be dividing nothing, so the
 * grid carries the whole message and the context line says who sent it.
 */
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

/**
 * A release. The divider earns its place here: what shipped is one question and
 * where it came from is another, and the reader usually wants only the first.
 */
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

/**
 * Starting points for the three event kinds DoU sends today.
 *
 * These are proposals, not transcripts. `@chatic/block-kit`'s
 * `WEBHOOK_BLOCKS_ERROR_REPORT` is what the server sends today and stays pinned
 * to it; a builder that could only reproduce the current shape would have nothing
 * to offer the person opening it.
 *
 * Every one is read through `toBlocks`, the same door a message from the server
 * comes through, so a template cannot contain a block the preview would have to
 * draw as `unsupported`.
 */
/**
 * The dots are raw palette colours rather than theme tokens on purpose: they
 * identify which of the three you are looking at, they do not report a state.
 * `bg-warning` and `bg-primary` would say "this template is a warning" and "this
 * template is the primary action", neither of which is true.
 */
export const TEMPLATES: readonly BuilderTemplate[] = [
    { id: 'error', label: 'Error', dotClass: 'bg-red-500', blocks: toBlocks(ERROR_BLOCKS) },
    { id: 'attendance', label: 'Attendance', dotClass: 'bg-emerald-600', blocks: toBlocks(ATTENDANCE_BLOCKS) },
    { id: 'deployment', label: 'Deployment', dotClass: 'bg-indigo-500', blocks: toBlocks(DEPLOYMENT_BLOCKS) },
] as const;
