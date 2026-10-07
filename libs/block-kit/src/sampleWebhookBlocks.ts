/**
 * A reference webhook message, modeled on what the server stores for one: a webhook post that
 * carries a plain-text `content` summary and a derived `blocks$` list. The values are made up
 * (service name, ids, URL), the shape is the point.
 *
 * `WEBHOOK_SEND_ERROR_REPORT` is the request body a webhook sender posts; `WEBHOOK_BLOCKS_ERROR_REPORT`
 * is the `blocks$` the server derives from its `meta` and stores on the chat. Together they make a
 * ChatView with `stereo: 'webhook'`, `content` from the send body and `blocks$` from the blocks.
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
