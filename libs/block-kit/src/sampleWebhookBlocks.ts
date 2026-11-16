/**
 * A reference webhook message, modeled on what the server stores for one: a webhook post that
 * carries a plain-text `content` summary and a derived `blocks$` list. The values are made up
 * (service name, ids, URL), the shape is the point.
 *
 * `WEBHOOK_SEND_ERROR_REPORT` is the request body a webhook sender posts; `WEBHOOK_BLOCKS_ERROR_REPORT`
 * is the `blocks$` the server derives from its `meta` and stores on the chat. Together they make a
 * ChatView with `stereo: 'webhook'`, `content` from the send body and `blocks$` from the blocks.
 *
 * Each sample also has the `source$` the server stores beside the blocks — the sender's channel name,
 * the report's address and the sender's `color` as sent — which is where the card's type badge, accent
 * colour and source link come from. The error, deployment and attendance samples are the three cards
 * the design draws.
 *
 * It lives in the lib so that desktop-web's render specs and this lib's own specs read one copy
 * rather than each keeping a sample of their own. Nothing here is checked against the server, so a
 * change to the server's shape shows up only when someone updates this sample.
 */

export const WEBHOOK_SEND_ERROR_REPORT = {
    content:
        "error-report: `example-api/production#1.0.0`\nTypeError: Cannot read properties of undefined (reading 'channelId')",
    stereo: 'webhook',
    token: '<WEBHOOK_TOKEN>',
    meta: {
        channel: 'error',
        pretext: "TypeError: Cannot read properties of undefined (reading 'channelId')",
        title: 'error-report: `example-api/production#1.0.0`',
        text: '{"service":"example-api/production#1.0.0","message":"TypeError: Cannot read properties of undefined (reading \'channelId\')","stack":"TypeError: Cannot read properties of undefined (reading \'channelId\')\\n    at Handler.onMessage (/var/task/dist/handler.js:12:34)","context":{"requestId":"11111111-2222-4333-8444-555555555555","connectionId":"AbCdEfGhIjKlMnO="}}',
        color: '#FFB71B',
        username: 'hello-alarm',
        ts: 1788912000,
        footer: 'example-api/production#1.0.0',
        sourceUrl: 'https://example.com/reports/2026-09-07/report.json',
    },
} as const;

export const WEBHOOK_BLOCKS_ERROR_REPORT = [
    {
        type: 'header',
        text: {
            type: 'plain_text',
            text: '🟠 error-report: example-api/production#1.0.0',
        },
    },
    {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: "TypeError: Cannot read properties of undefined (reading 'channelId')",
        },
    },
    {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: '{"service":"example-api/production#1.0.0","message":"TypeError: Cannot read properties of undefined (reading \'channelId\')","stack":"TypeError: Cannot read properties of undefined (reading \'channelId\')\\n    at Handler.onMessage (/var/task/dist/handler.js:12:34)","context":{"requestId":"11111111-2222-4333-8444-555555555555","connectionId":"AbCdEfGhIjKlMnO="}}',
        },
    },
    {
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: 'hello-alarm',
            },
            {
                type: 'mrkdwn',
                text: 'example-api/production#1.0.0',
            },
            {
                type: 'mrkdwn',
                text: '<https://example.com/reports/2026-09-07/report.json|원문 보기>',
            },
        ],
    },
] as const;

/** The `source$` the server stores for the error report: `meta.channel`, `meta.sourceUrl`, `meta.color`. */
export const WEBHOOK_SOURCE_ERROR_REPORT = {
    key: 'error',
    url: 'https://example.com/reports/2026-09-07/report.json',
    color: '#FFB71B',
} as const;

/** A deploy notice as a CI job posts it: a `good` colour, a few fields, the run as its source. */
export const WEBHOOK_SEND_DEPLOYMENT = {
    content: 'example-web dev 배포 완료',
    stereo: 'webhook',
    token: '<WEBHOOK_TOKEN>',
    meta: {
        channel: 'deployment',
        color: 'good',
        title: 'example-web dev 배포 완료',
        text: '• 웹 개발 서버 `v0.88.0`\n• 랜딩 개발 서버 `v0.18.2`',
        fields: [
            { title: '시각', value: '2026-11-16 09:34:23' },
            { title: '커밋', value: '713932b' },
        ],
        footer: 'example-web · by ci-bot · run #859',
        sourceUrl: 'https://example.com/actions/runs/859',
    },
} as const;

export const WEBHOOK_BLOCKS_DEPLOYMENT = [
    { type: 'header', text: { type: 'plain_text', text: '🟢 example-web dev 배포 완료' } },
    { type: 'section', text: { type: 'mrkdwn', text: '• 웹 개발 서버 `v0.88.0`\n• 랜딩 개발 서버 `v0.18.2`' } },
    {
        type: 'section',
        fields: [
            { type: 'mrkdwn', text: '*시각*\n2026-11-16 09:34:23' },
            { type: 'mrkdwn', text: '*커밋*\n713932b' },
        ],
    },
    {
        type: 'context',
        elements: [
            { type: 'mrkdwn', text: 'example-web · by ci-bot · run #859' },
            { type: 'mrkdwn', text: '<https://example.com/actions/runs/859|원문 보기>' },
        ],
    },
] as const;

export const WEBHOOK_SOURCE_DEPLOYMENT = {
    key: 'deployment',
    url: 'https://example.com/actions/runs/859',
    color: 'good',
} as const;

/** The day's attendance summary: no source to link, chips for who is away. Names are made up. */
export const WEBHOOK_SEND_ATTENDANCE = {
    content: '오늘 근태 · 2026.11.16',
    stereo: 'webhook',
    token: '<WEBHOOK_TOKEN>',
    meta: {
        channel: 'attendance',
        color: 'good',
        title: '오늘 근태 · 2026.11.16',
        text: '`Member A 연차` `Member B 반차`',
        footer: 'example-schedule',
    },
} as const;

export const WEBHOOK_BLOCKS_ATTENDANCE = [
    { type: 'header', text: { type: 'plain_text', text: '🟢 오늘 근태 · 2026.11.16' } },
    { type: 'section', text: { type: 'mrkdwn', text: '`Member A 연차` `Member B 반차`' } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'example-schedule' }] },
] as const;

export const WEBHOOK_SOURCE_ATTENDANCE = { key: 'attendance', color: 'good' } as const;
