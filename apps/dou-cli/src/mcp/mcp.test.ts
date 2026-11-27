import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAgentTools } from '@chatic/agent-tools';
import { fakeBackend, fakeRoom } from '@chatic/agent-tools/testing';

import { harnessTools } from './harnessTools';
import { createMcpHandler } from './server';
import { readSettingsFile } from './settingsFile';
import { shellLink } from './shellLink';
import { listenMcp } from './socket';

const posix = process.platform === 'win32' ? describe.skip : describe;

posix('dou-cli MCP server', () => {
    let profile: string;
    let shell: Server | undefined;
    const shellCalls: Array<{ method: string; params: unknown }> = [];

    const startShell = async (): Promise<void> => {
        shell = createServer(socket => {
            socket.on('data', chunk => {
                const request = JSON.parse(chunk.toString().trim());
                shellCalls.push({ method: request.method, params: request.params });
                const result =
                    request.method === 'screenshot' ? { format: 'png', base64: 'iVBORw==' } : { ok: request.method };
                socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
            });
        });
        await new Promise<void>(resolve => shell?.listen(join(profile, 'shell.sock'), resolve));
    };

    const build = (backend = fakeBackend({ rooms: [fakeRoom()] })) => {
        const getSettings = readSettingsFile(profile);
        const agent = createAgentTools({ backend, getSettings });
        const handler = createMcpHandler({
            tools: [...agent.tools, ...harnessTools(shellLink(profile, 2000), getSettings)],
            name: 'dou',
            version: '0.0.1',
            methods: { 'dou/ping': async () => ({ pong: true }) },
        });
        return { backend, agent, handler };
    };

    const rpc = async (handler: ReturnType<typeof build>['handler'], method: string, params?: unknown) =>
        JSON.parse((await handler(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }))) ?? 'null');

    beforeEach(() => {
        profile = mkdtempSync(join(tmpdir(), 'dou-mcp-'));
        shellCalls.length = 0;
    });
    afterEach(async () => {
        await new Promise<void>(resolve => (shell ? shell.close(() => resolve()) : resolve()));
        shell = undefined;
        rmSync(profile, { recursive: true, force: true });
    });

    it('answers initialize and lists the registry tools plus the harness tools', async () => {
        const { handler, agent } = build();
        const init = await rpc(handler, 'initialize', { protocolVersion: '2025-03-26' });
        expect(init.result).toMatchObject({ protocolVersion: '2025-03-26', serverInfo: { name: 'dou' } });
        expect(await handler(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))).toBeUndefined();
        const list = await rpc(handler, 'tools/list');
        const names = list.result.tools.map((tool: { name: string }) => tool.name);
        for (const tool of agent.tools) expect(names).toContain(tool.name);
        expect(names).toEqual(
            expect.arrayContaining([
                'app_reload',
                'app_source',
                'screenshot',
                'logs_tail',
                'mini_app_open',
                'mini_app_list',
                'mini_app_close',
            ])
        );
        expect(names).toHaveLength(agent.tools.length + 7);
        expect((await rpc(handler, 'dou/ping')).result).toEqual({ pong: true });
        expect((await rpc(handler, 'nope')).error.code).toBe(-32601);
    });

    it('re-reads settings.json on every call: tier read refuses send, a later write tier allows it', async () => {
        const { handler, backend } = build();
        const send = () =>
            rpc(handler, 'tools/call', { name: 'message_send', arguments: { channelId: 'r1', text: 'hi' } });
        const refused = await send();
        expect(refused.result.isError).toBe(true);
        expect(JSON.parse(refused.result.content[0].text).code).toBe('tier_read_only');
        writeFileSync(join(profile, 'settings.json'), JSON.stringify({ tier: 'write', allowRooms: ['r1'] }));
        const sent = await send();
        expect(sent.result.isError).toBeUndefined();
        expect((backend as ReturnType<typeof fakeBackend>).sent).toHaveLength(1);
    });

    it('treats a broken settings.json as tier off', async () => {
        const { handler } = build();
        writeFileSync(join(profile, 'settings.json'), '{ nope');
        const result = await rpc(handler, 'tools/call', { name: 'rooms_list', arguments: {} });
        expect(JSON.parse(result.result.content[0].text).code).toBe('tier_off');
    });

    it('forwards harness tools to shell.sock and returns the screenshot as image content', async () => {
        await startShell();
        writeFileSync(join(profile, 'settings.json'), JSON.stringify({ tier: 'write' }));
        const { handler } = build();
        const shot = await rpc(handler, 'tools/call', { name: 'screenshot', arguments: {} });
        expect(shot.result.content).toEqual([{ type: 'image', data: 'iVBORw==', mimeType: 'image/png' }]);
        await rpc(handler, 'tools/call', { name: 'logs_tail', arguments: { file: 'node', lines: 5 } });
        await rpc(handler, 'tools/call', { name: 'mini_app_open', arguments: { source: './dist' } });
        expect(shellCalls.map(call => call.method)).toEqual(['screenshot', 'logs_tail', 'mini_app_open']);
        expect(shellCalls[1].params).toEqual({ file: 'node', lines: 5 });
        expect(shellCalls[2].params).toEqual({ source: './dist' });
        const bad = await rpc(handler, 'tools/call', { name: 'logs_tail', arguments: { file: '../etc' } });
        expect(JSON.parse(bad.result.content[0].text).code).toBe('bad_params');
    });

    it('keeps DoU tools working and returns a tool error when the shell is absent', async () => {
        writeFileSync(join(profile, 'settings.json'), JSON.stringify({ tier: 'write' }));
        const { handler } = build();
        const shot = await rpc(handler, 'tools/call', { name: 'screenshot', arguments: {} });
        expect(shot.result.isError).toBe(true);
        expect(JSON.parse(shot.result.content[0].text).code).toBe('shell_unavailable');
        expect(
            (await rpc(handler, 'tools/call', { name: 'rooms_list', arguments: {} })).result.isError
        ).toBeUndefined();
    });

    it('gates harness tools by tier: read blocks mutating ones, off blocks all', async () => {
        await startShell();
        const { handler } = build();
        const reload = await rpc(handler, 'tools/call', { name: 'app_reload', arguments: {} });
        expect(JSON.parse(reload.result.content[0].text).code).toBe('tier_read_only');
        const tail = await rpc(handler, 'tools/call', { name: 'logs_tail', arguments: {} });
        expect(tail.result.isError).toBeUndefined();
        writeFileSync(join(profile, 'settings.json'), JSON.stringify({ tier: 'off' }));
        const off = await rpc(handler, 'tools/call', { name: 'logs_tail', arguments: {} });
        expect(JSON.parse(off.result.content[0].text).code).toBe('tier_off');
    });

    it('serves lines over mcp.sock with mode 0600, refuses a live socket, replaces a stale one, and removes it on close', async () => {
        const { handler } = build();
        const listener = await listenMcp(profile, handler);
        const file = join(profile, 'mcp.sock');
        expect(statSync(file).mode & 0o777).toBe(0o600);
        const answer = await new Promise<string>(resolve => {
            const client = createConnection(file);
            client.on('data', chunk => {
                client.destroy();
                resolve(chunk.toString());
            });
            client.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' })}\n`);
        });
        expect(JSON.parse(answer)).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
        await expect(listenMcp(profile, handler)).rejects.toThrow(/already serves/);
        await listener.close();
        expect(() => statSync(file)).toThrow();
        writeFileSync(file, '');
        const again = await listenMcp(profile, handler);
        await again.close();
    });
});
