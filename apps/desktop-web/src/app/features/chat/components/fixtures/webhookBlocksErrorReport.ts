/**
 * Server fixtures, byte-for-byte -- copied via `gh api` from
 * `chatic-socials-api@feat/webhook-message-blocks` `sample/chats/`, not
 * hand-typed (SPEC.md Sec.3.5, Sec.6-9: knowledge#319
 * projects/@lemoncloud-io/chatic-socials-api/webhook-message-blocks/SPEC.md).
 *
 * `WEBHOOK_SEND_ERROR_REPORT` is the request body a webhook sender posts
 * (`webhook-send-error-report.json`); `WEBHOOK_BLOCKS_ERROR_REPORT` is the
 * `blocks$` the server derives from its `meta` and stores on the chat
 * (`webhook-blocks-error-report.json`). Together they are the ChatView SPEC
 * Sec.6-9 describes: `stereo: 'webhook'`, `content` from the send file,
 * `blocks$` from the blocks file.
 */

export const WEBHOOK_SEND_ERROR_REPORT = {
    content:
        "error-report: `chatic-sockets-api/lemon-production#0.26.710`\nTypeError: Cannot read properties of undefined (reading 'channelId')",
    stereo: 'webhook',
    token: '<WEBHOOK_TOKEN>',
    meta: {
        pretext: "TypeError: Cannot read properties of undefined (reading 'channelId')",
        title: 'error-report: `chatic-sockets-api/lemon-production#0.26.710`',
        text: '{"service":"chatic-sockets-api/lemon-production#0.26.710","message":"TypeError: Cannot read properties of undefined (reading \'channelId\')","stack":"TypeError: Cannot read properties of undefined (reading \'channelId\')\\n    at WSSHandler.onCast (/var/task/dist/lib/wss/wss-handler.js:212:41)","context":{"requestId":"c6a2d4f0-3b1e-4b8a-9f57-2d1e8a0f9c11","connectionId":"K3xPqdQ1CjMCEbg="}}',
        color: '#FFB71B',
        username: 'hello-alarm',
        ts: 1788912000,
        footer: 'chatic-sockets-api/lemon-production#0.26.710',
        sourceUrl: 'https://eureka-hello-www.s3.ap-northeast-2.amazonaws.com/slack/2026-09-07/c6a2d4f0.json',
    },
} as const;

export const WEBHOOK_BLOCKS_ERROR_REPORT = [
    {
        type: 'header',
        text: {
            type: 'plain_text',
            text: '🟠 error-report: chatic-sockets-api/lemon-production#0.26.710',
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
            text: '{"service":"chatic-sockets-api/lemon-production#0.26.710","message":"TypeError: Cannot read properties of undefined (reading \'channelId\')","stack":"TypeError: Cannot read properties of undefined (reading \'channelId\')\\n    at WSSHandler.onCast (/var/task/dist/lib/wss/wss-handler.js:212:41)","context":{"requestId":"c6a2d4f0-3b1e-4b8a-9f57-2d1e8a0f9c11","connectionId":"K3xPqdQ1CjMCEbg="}}',
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
                text: 'chatic-sockets-api/lemon-production#0.26.710',
            },
            {
                type: 'mrkdwn',
                text: '<https://eureka-hello-www.s3.ap-northeast-2.amazonaws.com/slack/2026-09-07/c6a2d4f0.json|원문 보기>',
            },
        ],
    },
] as const;
