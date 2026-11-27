import { toolErrorBody } from '@chatic/agent-tools';
import type { ToolDef } from '@chatic/agent-tools';

export type McpBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

const CONTENT = Symbol('mcp-content');

export const content = (blocks: McpBlock[]): object => ({ [CONTENT]: blocks });

const blocksOf = (value: unknown): McpBlock[] | undefined =>
    typeof value === 'object' && value !== null && CONTENT in value
        ? (value as Record<symbol, McpBlock[]>)[CONTENT]
        : undefined;

export type RpcMethod = (params: unknown) => Promise<unknown>;

export interface McpHandlerOptions {
    tools: ToolDef[];
    name: string;
    version: string;
    methods?: Record<string, RpcMethod>;
}

export type McpHandler = (line: string) => Promise<string | undefined>;

const DEFAULT_PROTOCOL = '2025-06-18';

const reply = (id: unknown, result: unknown): string => JSON.stringify({ jsonrpc: '2.0', id, result });

const failure = (id: unknown, code: number, message: string): string =>
    JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const createMcpHandler = ({ tools, name, version, methods = {} }: McpHandlerOptions): McpHandler => {
    const byName = new Map(tools.map(tool => [tool.name, tool]));

    const call = async (params: unknown): Promise<unknown> => {
        const request = isRecord(params) ? params : {};
        const tool = typeof request.name === 'string' ? byName.get(request.name) : undefined;
        if (!tool) return undefined;
        try {
            const value = await tool.handler(isRecord(request.arguments) ? request.arguments : {});
            return { content: blocksOf(value) ?? [{ type: 'text', text: JSON.stringify(value ?? null) }] };
        } catch (error) {
            return { isError: true, content: [{ type: 'text', text: JSON.stringify(toolErrorBody(error)) }] };
        }
    };

    return async line => {
        let request: unknown;
        try {
            request = JSON.parse(line);
        } catch {
            return failure(null, -32700, 'parse error');
        }
        if (!isRecord(request) || typeof request.method !== 'string') return failure(null, -32600, 'invalid request');
        const { method, params } = request;
        const isNotification = !('id' in request);
        const id = request.id ?? null;
        if (isNotification) return undefined;
        if (method === 'initialize') {
            const asked = isRecord(params) ? params.protocolVersion : undefined;
            return reply(id, {
                protocolVersion: typeof asked === 'string' ? asked : DEFAULT_PROTOCOL,
                capabilities: { tools: {} },
                serverInfo: { name, version },
            });
        }
        if (method === 'ping') return reply(id, {});
        if (method === 'tools/list') {
            return reply(id, {
                tools: tools.map(({ name: toolName, description, inputSchema }) => ({
                    name: toolName,
                    description,
                    inputSchema,
                })),
            });
        }
        if (method === 'tools/call') {
            const result = await call(params);
            return result === undefined ? failure(id, -32602, 'unknown tool') : reply(id, result);
        }
        const extra = Object.hasOwn(methods, method) ? methods[method] : undefined;
        if (!extra) return failure(id, -32601, `unknown method ${method}`);
        try {
            return reply(id, await extra(params));
        } catch (error) {
            return failure(id, -32000, toolErrorBody(error).message);
        }
    };
};
