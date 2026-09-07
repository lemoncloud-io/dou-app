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
 * can carry (knowledge#319 SPEC §3.3).
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
            text: '```Error: socket hang up\n    at connResetException (node:internal/errors:720:14)\n    at Socket.socketCloseListener (node:_http_client:474:25)\n    at TCP.&lt;anonymous&gt; (node:net:350:12)```',
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
    { type: 'header', text: { type: 'plain_text', text: '🟢 오늘 근태 · 2026.08.28' } },
    { type: 'section', text: { type: 'mrkdwn', text: '자리를 비우는 사람은 *1명*입니다.' } },
    {
        type: 'section',
        fields: [
            { type: 'mrkdwn', text: '*Raine 공상택*\n연차 · 하루 종일' },
            { type: 'mrkdwn', text: '*대신 볼 사람*\nLouis 김태호' },
        ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '스케줄앱' }] },
];

/**
 * A release. The divider earns its place here: what shipped is one question and
 * where it came from is another, and the reader usually wants only the first.
 */
const DEPLOYMENT_BLOCKS = [
    { type: 'header', text: { type: 'plain_text', text: '🟢 Flows v0.73.0 배포 완료' } },
    { type: 'section', text: { type: 'mrkdwn', text: '*개발 서버*에 올라갔습니다. 2분 41초 걸렸습니다.' } },
    { type: 'divider' },
    {
        type: 'section',
        fields: [
            { type: 'mrkdwn', text: '*배포 시각*\n2026.08.25 16:11:51' },
            {
                type: 'mrkdwn',
                text: '*커밋*\n<https://github.com/lemoncloud-io/eureka-flows/commit/7b186ab|7b186ab> by louis-lemon',
            },
        ],
    },
    {
        type: 'context',
        elements: [
            { type: 'mrkdwn', text: '릴리즈봇' },
            { type: 'mrkdwn', text: '<https://github.com/lemoncloud-io/eureka-flows/actions|Actions run>' },
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
export const TEMPLATES: readonly BuilderTemplate[] = [
    { id: 'error', label: 'Error (오류)', dotClass: 'bg-destructive', blocks: toBlocks(ERROR_BLOCKS) },
    { id: 'attendance', label: 'Attendance (근태)', dotClass: 'bg-warning', blocks: toBlocks(ATTENDANCE_BLOCKS) },
    { id: 'deployment', label: 'Deployment (배포)', dotClass: 'bg-primary', blocks: toBlocks(DEPLOYMENT_BLOCKS) },
] as const;
