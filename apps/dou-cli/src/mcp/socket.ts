import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';

import { endpointFile } from './paths';
import type { McpHandler } from './server';

const MAX_LINE = 1024 * 1024;

export interface McpListener {
    close(): Promise<void>;
}

const isAlive = (path: string): Promise<boolean> =>
    new Promise(resolve => {
        const probe = createConnection(path);
        probe.once('connect', () => {
            probe.destroy();
            resolve(true);
        });
        probe.once('error', () => resolve(false));
    });

const pipeName = (): string => `\\\\.\\pipe\\dou-mcp-${process.pid}-${Date.now().toString(36)}`;

const serveConnection = (socket: Socket, handler: McpHandler): void => {
    let buffer = '';
    let chain = Promise.resolve();
    socket.setEncoding('utf8');
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk: string) => {
        buffer += chunk;
        if (buffer.length > MAX_LINE && !buffer.includes('\n')) {
            socket.destroy();
            return;
        }
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (!line.trim()) continue;
            chain = chain.then(async () => {
                const answer = await handler(line).catch(() => undefined);
                if (answer !== undefined && !socket.destroyed) socket.write(`${answer}\n`);
            });
        }
    });
};

const listen = (server: Server, target: string): Promise<void> =>
    new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(target, () => {
            server.off('error', reject);
            resolve();
        });
    });

export const listenMcp = async (profile: string, handler: McpHandler): Promise<McpListener> => {
    const file = endpointFile(profile, 'mcp');
    const windows = process.platform === 'win32';
    if (!windows && existsSync(file)) {
        if (await isAlive(file)) throw new Error(`another dou-cli already serves ${file}`);
        rmSync(file, { force: true });
    }
    const sockets = new Set<Socket>();
    const server = createServer(socket => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
        serveConnection(socket, handler);
    });
    if (windows) {
        const name = pipeName();
        await listen(server, name);
        writeFileSync(file, name);
    } else {
        await listen(server, file);
        chmodSync(file, 0o600);
    }
    return {
        close: () =>
            new Promise(resolve => {
                rmSync(file, { force: true });
                server.close(() => resolve());
                for (const socket of sockets) socket.destroy();
            }),
    };
};
