import { asParams, clampedInt, optionalInt } from '../params';
import { objectSchema } from '../toolTypes';
import type { ToolContext, ToolDef } from '../toolTypes';

const MAX_WAIT_MS = 60_000;
const DEFAULT_WAIT_MS = 30_000;

export const eventTools = (context: ToolContext): ToolDef[] => [
    {
        name: 'events_list',
        description:
            'List events after a cursor: mentions of me, direct messages, thread replies to me, and new messages in allowed rooms.',
        inputSchema: objectSchema({ since: { type: 'integer' }, limit: { type: 'integer' } }),
        async handler(input) {
            const params = asParams(input);
            context.authorize({ kind: 'read' });
            return context.events.since({
                since: optionalInt(params, 'since') ?? 0,
                limit: clampedInt(params, 'limit', 50, 1, 200),
                tail: params.tail === true,
            });
        },
    },
    {
        name: 'events_wait',
        description:
            'Wait up to timeoutMs (max 60000) for events after a cursor, then return them with the new cursor.',
        inputSchema: objectSchema({ since: { type: 'integer' }, timeoutMs: { type: 'integer' } }),
        async handler(input) {
            const params = asParams(input);
            context.authorize({ kind: 'read' });
            return context.events.wait(
                { since: optionalInt(params, 'since') ?? 0, limit: clampedInt(params, 'limit', 50, 1, 200) },
                clampedInt(params, 'timeoutMs', DEFAULT_WAIT_MS, 0, MAX_WAIT_MS)
            );
        },
    },
];
