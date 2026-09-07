import { toBlocks, type KnownBlock } from '@chatic/block-kit';

export interface BuilderTemplate {
    id: 'error' | 'attendance' | 'deployment';
    label: string;
    /** A dot in the rail, so the three read as a set rather than a list of words. */
    dotClass: string;
    blocks: KnownBlock[];
}

/**
 * `sample/chats/webhook-blocks-error-report.json` from
 * `chatic-socials-api@feat/webhook-message-blocks`, verbatim — the `blocks$` the
 * server derives from a real lemon-core error report.
 *
 * Copied rather than invented so this template is evidence: what the builder
 * shows for `Error` is what a channel already receives, and its spec compares
 * the two. The other two templates have no server counterpart (the transformer
 * has one shape and this is it), so they are ours and say so.
 */
const ERROR_BLOCKS = [
    {
        type: 'header',
        text: { type: 'plain_text', text: '🟠 error-report: chatic-sockets-api/lemon-production#0.26.710' },
    },
    {
        type: 'section',
        text: { type: 'mrkdwn', text: "TypeError: Cannot read properties of undefined (reading 'channelId')" },
    },
    {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: '{"service":"chatic-sockets-api/lemon-production#0.26.710","message":"TypeError: Cannot read properties of undefined (reading \'channelId\')","stack":"TypeError: Cannot read properties of undefined (reading \'channelId\')\\n    at WSSHandler.onCast (/var/task/dist/lib/wss/wss-handler.js:212:41)","context":{"requestId":"c6a2d4f0-3b1e-4b8a-9f57-2d1e8a0f9c11","connectionId":"K3xPqdQ1CjMCEbg="}}',
        },
    },
    {
        type: 'context',
        elements: [
            { type: 'mrkdwn', text: 'hello-alarm' },
            { type: 'mrkdwn', text: 'chatic-sockets-api/lemon-production#0.26.710' },
            {
                type: 'mrkdwn',
                text: '<https://eureka-hello-www.s3.ap-northeast-2.amazonaws.com/slack/2026-09-07/c6a2d4f0.json|원문 보기>',
            },
        ],
    },
];

// The status colour is an emoji in the header, not a coloured chip: that is what
// the server's transformer does with an attachment's colour, and a chip here
// would be a shape no message can carry (knowledge#319 SPEC §3.3).
const ATTENDANCE_BLOCKS = [
    { type: 'header', text: { type: 'plain_text', text: '🟢 오늘 근태 · 2026.08.28' } },
    {
        type: 'section',
        fields: [
            { type: 'mrkdwn', text: '*이름*\nRaine 공상택' },
            { type: 'mrkdwn', text: '*구분*\n연차' },
        ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '스케줄앱' }] },
];

const DEPLOYMENT_BLOCKS = [
    { type: 'header', text: { type: 'plain_text', text: '🟢 Eureka Flows 개발 배포 알림' } },
    { type: 'section', text: { type: 'mrkdwn', text: '*Flows 개발 서버* `v0.73.0`' } },
    { type: 'divider' },
    {
        type: 'section',
        fields: [
            { type: 'mrkdwn', text: '*배포 시각*\n2026.08.25 16:11:51' },
            { type: 'mrkdwn', text: '*커밋*\n<https://github.com/lemoncloud-io/eureka-flows/commit/7b186ab|7b186ab>' },
        ],
    },
    {
        type: 'context',
        elements: [
            { type: 'mrkdwn', text: 'by louis-lemon' },
            { type: 'mrkdwn', text: '<https://github.com/lemoncloud-io/eureka-flows/actions|View Actions Run>' },
        ],
    },
];

/**
 * Starting points for the three event kinds DoU sends today.
 *
 * Every one is read through `toBlocks`, the same door a message from the server
 * comes through, so a template cannot contain a block the preview would have to
 * draw as `unsupported`.
 */
export const TEMPLATES: readonly BuilderTemplate[] = [
    { id: 'error', label: 'Error (오류)', dotClass: 'bg-destructive', blocks: toBlocks(ERROR_BLOCKS) },
    { id: 'attendance', label: 'Attendance (근태)', dotClass: 'bg-warning', blocks: toBlocks(ATTENDANCE_BLOCKS) },
    { id: 'deployment', label: 'Deployment (배포)', dotClass: 'bg-primary', blocks: toBlocks(DEPLOYMENT_BLOCKS) },
] as const;
