import { createConnection } from 'node:net';

import { AgentToolError } from '@chatic/agent-tools';

import { resolveEndpoint } from './paths';

export type ShellCall = (method: string, params?: unknown) => Promise<unknown>;

const TIMEOUT_MS = 15_000;

const unavailable = (): AgentToolError =>
    new AgentToolError('shell_unavailable', 'The DoU shell is not running for this profile, so this tool cannot run.');

export const shellLink =
    (profile: string, timeoutMs = TIMEOUT_MS): ShellCall =>
    (method, params = {}) =>
        new Promise((resolve, reject) => {
            let path: string;
            try {
                path = resolveEndpoint(profile, 'shell');
            } catch {
                return reject(unavailable());
            }
            const socket = createConnection(path);
            let buffer = '';
            let settled = false;
            const finish = (action: () => void): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                socket.destroy();
                action();
            };
            const timer = setTimeout(
                () => finish(() => reject(new AgentToolError('shell_timeout', `The shell did not answer ${method}.`))),
                timeoutMs
            );
            socket.on('connect', () => socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })}\n`));
            socket.on('data', chunk => {
                buffer += chunk.toString('utf8');
                const end = buffer.indexOf('\n');
                if (end < 0) return;
                finish(() => {
                    try {
                        const answer = JSON.parse(buffer.slice(0, end)) as {
                            result?: unknown;
                            error?: { message?: string };
                        };
                        if (answer.error) {
                            reject(new AgentToolError('shell_error', answer.error.message ?? 'shell error'));
                        } else resolve(answer.result);
                    } catch {
                        reject(new AgentToolError('shell_error', 'The shell sent an answer that is not JSON.'));
                    }
                });
            });
            socket.on('error', () => finish(() => reject(unavailable())));
            socket.on('close', () => finish(() => reject(unavailable())));
        });
