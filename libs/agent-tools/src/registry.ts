import type { AgentBackend } from './backend';
import { createEventLog } from './events';
import { assertAuthorized } from './gate';
import { createLimiter } from './limiter';
import { READ_RATE_LIMIT, allowsRoom } from './settings';
import type { Settings } from './settings';
import { eventTools } from './tools/eventTools';
import { readTools } from './tools/readTools';
import { writeTools } from './tools/writeTools';
import type { ToolContext, ToolDef } from './toolTypes';
import { AgentToolError } from './errors';
import { wrapUntrusted } from './untrusted';

export interface AgentToolsOptions {
    backend: AgentBackend;
    getSettings: () => Settings;
    now?: () => number;
}

export interface AgentTools {
    tools: ToolDef[];
    dispose(): void;
}

export const createAgentTools = (options: AgentToolsOptions): AgentTools => {
    const { backend, getSettings } = options;
    const now = options.now ?? Date.now;
    const writes = createLimiter();
    const reads = createLimiter();

    const events = createEventLog({
        me: backend.cloud().me,
        isRoomAllowed: channelId => allowsRoom(getSettings(), channelId),
    });
    const unsubscribe = backend.subscribe(incoming => events.push(incoming));

    const context: ToolContext = {
        backend,
        events,
        settings: getSettings,
        authorize(action) {
            const settings = getSettings();
            assertAuthorized(settings, action, writes, now());
            return settings;
        },
        meter() {
            if (!reads.tryAcquire(READ_RATE_LIMIT, now())) {
                throw new AgentToolError('rate_limited', 'Too many reads. Wait before asking again.');
            }
        },
    };

    const tools = [...readTools(context), ...writeTools(context), ...eventTools(context)].map(
        (tool): ToolDef => ({
            ...tool,
            handler: async params => wrapUntrusted(await tool.handler(params)),
        })
    );

    return { tools, dispose: unsubscribe };
};
