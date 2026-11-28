import type { AgentBackend } from './backend';
import type { EventLog } from './events';
import type { Action } from './gate';
import type { Settings } from './settings';

export interface ToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (params: unknown) => Promise<unknown>;
}

export interface ToolContext {
    backend: AgentBackend;
    events: EventLog;
    settings: () => Settings;
    authorize: (action: Action) => Settings;
    meter: () => void;
}

export const objectSchema = (
    properties: Record<string, unknown>,
    required: string[] = []
): Record<string, unknown> => ({
    type: 'object',
    properties,
    required,
});

export const CHANNEL_ID = { type: 'string' };
