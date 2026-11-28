import { AgentToolError } from '@chatic/agent-tools';
import type { Settings, ToolDef } from '@chatic/agent-tools';

import { content } from './server';
import type { ShellCall } from './shellLink';

const object = (properties: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    type: 'object',
    properties,
    ...extra,
});

const LOG_FILES = ['webview', 'node', 'shell'];
const DEFAULT_LOG_LINES = 100;
const MAX_LOG_LINES = 1000;

const asParams = (input: unknown): Record<string, unknown> =>
    typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

export const harnessTools = (call: ShellCall, getSettings: () => Settings): ToolDef[] => {
    const allow = (needsWrite: boolean): void => {
        const { tier } = getSettings();
        if (tier === 'off') {
            throw new AgentToolError(
                'tier_off',
                'Agent access is off. The owner turns it on from the app, never through a tool.'
            );
        }
        if (needsWrite && tier === 'read') {
            throw new AgentToolError('tier_read_only', 'The permission tier is read only, so this tool is refused.');
        }
    };
    const forward =
        (method: string, needsWrite: boolean) =>
        async (params: unknown): Promise<unknown> => {
            allow(needsWrite);
            return call(method, asParams(params));
        };

    return [
        {
            name: 'app_reload',
            description: 'Reload the web page shown in the DoU desktop window.',
            inputSchema: object(),
            handler: forward('reload', true),
        },
        {
            name: 'app_source',
            description:
                'Show which web app the window loads. With "set" (a built folder or an http(s) URL) switch to it and restart the shell.',
            inputSchema: object({ set: { type: 'string' } }),
            async handler(params) {
                const { set } = asParams(params);
                allow(typeof set === 'string');
                return call('app_source', typeof set === 'string' ? { set } : {});
            },
        },
        {
            name: 'screenshot',
            description: 'Capture the main DoU window as a PNG image.',
            inputSchema: object(),
            async handler() {
                allow(false);
                const shot = asParams(await call('screenshot', {}));
                if (typeof shot.base64 !== 'string') {
                    throw new AgentToolError('shell_error', 'The shell sent no image.');
                }
                return content([{ type: 'image', data: shot.base64, mimeType: 'image/png' }]);
            },
        },
        {
            name: 'logs_tail',
            description: 'Read the last lines of a profile log: webview, node or shell.',
            inputSchema: object({
                file: { type: 'string', enum: LOG_FILES },
                lines: { type: 'integer', minimum: 1, maximum: MAX_LOG_LINES },
            }),
            async handler(params) {
                allow(false);
                const { file, lines } = asParams(params);
                if (file !== undefined && (typeof file !== 'string' || !LOG_FILES.includes(file))) {
                    throw new AgentToolError('bad_params', `file must be one of ${LOG_FILES.join(', ')}`);
                }
                const count = typeof lines === 'number' && Number.isInteger(lines) ? lines : DEFAULT_LOG_LINES;
                return call('logs_tail', { file: file ?? 'shell', lines: Math.min(Math.max(count, 1), MAX_LOG_LINES) });
            },
        },
        {
            name: 'mini_app_open',
            description: 'Open a mini-app in the DoU desktop window: a built folder or an http(s) URL.',
            inputSchema: object({ source: { type: 'string' } }, { additionalProperties: true }),
            handler: forward('mini_app_open', true),
        },
        {
            name: 'mini_app_list',
            description: 'List the mini-app views that are open.',
            inputSchema: object(),
            handler: forward('mini_app_list', false),
        },
        {
            name: 'mini_app_close',
            description: 'Close a mini-app view.',
            inputSchema: object({ id: { type: 'string' } }, { additionalProperties: true }),
            handler: forward('mini_app_close', true),
        },
    ];
};
