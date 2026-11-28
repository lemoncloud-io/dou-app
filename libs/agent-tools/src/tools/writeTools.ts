import { AgentToolError } from '../errors';
import { asParams, requireInChannel, requireText, textList } from '../params';
import { CHANNEL_ID, objectSchema } from '../toolTypes';
import type { ToolContext, ToolDef } from '../toolTypes';

import { messageResult } from './readTools';

export const AI_PREFIX = '[AI] ';

export const withAiPrefix = (text: string): string => (text.startsWith(AI_PREFIX) ? text : `${AI_PREFIX}${text}`);

export const writeTools = (context: ToolContext): ToolDef[] => {
    const { backend } = context;

    return [
        {
            name: 'message_send',
            description: "Send a message to an allow-listed room. The tool adds the prefix '[AI] ' itself.",
            inputSchema: objectSchema({ channelId: CHANNEL_ID, text: { type: 'string' } }, ['channelId', 'text']),
            async handler(input) {
                const params = asParams(input);
                const channelId = requireText(params, 'channelId');
                const text = requireText(params, 'text');
                context.authorize({ kind: 'write', channelId });
                return messageResult(await backend.send(channelId, withAiPrefix(text), {}));
            },
        },
        {
            name: 'thread_reply',
            description: "Reply in a thread of an allow-listed room. The tool adds the prefix '[AI] ' itself.",
            inputSchema: objectSchema(
                { channelId: CHANNEL_ID, parentId: { type: 'string' }, text: { type: 'string' } },
                ['channelId', 'parentId', 'text']
            ),
            async handler(input) {
                const params = asParams(input);
                const channelId = requireText(params, 'channelId');
                const text = requireText(params, 'text');
                const parentId = requireText(params, 'parentId');
                requireInChannel(channelId, parentId, 'parentId');
                context.authorize({ kind: 'write', channelId });
                return messageResult(await backend.send(channelId, withAiPrefix(text), { parentId }));
            },
        },
        {
            name: 'reaction_set',
            description: 'Add or remove an emoji reaction in an allow-listed room.',
            inputSchema: objectSchema(
                {
                    channelId: CHANNEL_ID,
                    chatId: { type: 'string' },
                    emoji: { type: 'string' },
                    on: { type: 'boolean' },
                },
                ['channelId', 'chatId', 'emoji']
            ),
            async handler(input) {
                const params = asParams(input);
                const channelId = requireText(params, 'channelId');
                const chatId = requireText(params, 'chatId');
                const emoji = requireText(params, 'emoji');
                requireInChannel(channelId, chatId, 'chatId');
                context.authorize({ kind: 'write', channelId });
                await backend.react(channelId, chatId, emoji, params.on !== false);
                return { ok: true };
            },
        },
        {
            name: 'mention_send',
            description:
                "Send a message that mentions people, in an allow-listed room. The tool adds the prefix '[AI] ' itself.",
            inputSchema: objectSchema(
                {
                    channelId: CHANNEL_ID,
                    text: { type: 'string' },
                    userIds: { type: 'array', items: { type: 'string' } },
                },
                ['channelId', 'text', 'userIds']
            ),
            async handler(input) {
                const params = asParams(input);
                const channelId = requireText(params, 'channelId');
                const text = requireText(params, 'text');
                const mentionUserIds = textList(params, 'userIds');
                if (mentionUserIds.length === 0) throw new AgentToolError('bad_params', 'userIds is required');
                context.authorize({ kind: 'write', channelId });
                return messageResult(await backend.send(channelId, withAiPrefix(text), { mentionUserIds }));
            },
        },
    ];
};
