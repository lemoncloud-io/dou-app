import { WEBHOOK_BLOCKS_ERROR_REPORT, toBlocks, type KnownBlock } from '@chatic/block-kit';

export interface BuilderTemplate {
    id: 'error' | 'attendance' | 'deployment';
    label: string;
    /** A dot in the rail, so the three read as a set rather than a list of words. */
    dotClass: string;
    blocks: KnownBlock[];
}

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
 * `Error` is the shared reference payload rather than a copy of it, so "what the
 * builder shows is what a channel receives" holds by construction — there is
 * nothing here for a second copy to drift away from.
 *
 * Every one is read through `toBlocks`, the same door a message from the server
 * comes through, so a template cannot contain a block the preview would have to
 * draw as `unsupported`.
 */
export const TEMPLATES: readonly BuilderTemplate[] = [
    { id: 'error', label: 'Error (오류)', dotClass: 'bg-destructive', blocks: toBlocks(WEBHOOK_BLOCKS_ERROR_REPORT) },
    { id: 'attendance', label: 'Attendance (근태)', dotClass: 'bg-warning', blocks: toBlocks(ATTENDANCE_BLOCKS) },
    { id: 'deployment', label: 'Deployment (배포)', dotClass: 'bg-primary', blocks: toBlocks(DEPLOYMENT_BLOCKS) },
] as const;
