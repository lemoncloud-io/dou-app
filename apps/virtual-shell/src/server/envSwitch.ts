export type ShellEnv = 'dev' | 'prod';

/** The request a shell page sends to run the other backend. */
export const ENV_SWITCH_PATH = '/__shell/api/env';
export const ENV_SWITCH_HEADER = 'x-virtual-shell';

export interface EnvRequest {
    method: string | undefined;
    headers: Record<string, string | string[] | undefined>;
    remoteAddress: string | undefined;
    body: string;
}

export type EnvRequestCheck = { ok: true; env: ShellEnv } | { ok: false; status: 400 | 403 | 405; reason: string };

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Whether a request to switch backends may be acted on. Starting the prod pair is the one thing a
 * page can ask this server to do, so only the shell page itself may ask: from this machine, with the
 * shell's own header — which a page on another origin cannot add without a preflight this server never
 * answers — and with an `Origin` that is this shell's.
 */
export const checkEnvRequest = (request: EnvRequest, shellPort: number): EnvRequestCheck => {
    if (request.method !== 'POST') return { ok: false, status: 405, reason: 'POST only' };
    if (!request.remoteAddress || !LOOPBACK.has(request.remoteAddress)) {
        return { ok: false, status: 403, reason: 'not from this machine' };
    }
    if (request.headers[ENV_SWITCH_HEADER] !== '1') return { ok: false, status: 403, reason: 'missing shell header' };
    const origin = request.headers['origin'];
    const allowed = [`http://localhost:${shellPort}`, `http://127.0.0.1:${shellPort}`];
    if (typeof origin !== 'string' || !allowed.includes(origin)) {
        return { ok: false, status: 403, reason: 'not from this shell' };
    }
    let env: unknown;
    try {
        env = (JSON.parse(request.body) as { env?: unknown }).env;
    } catch {
        return { ok: false, status: 400, reason: 'body is not JSON' };
    }
    if (env !== 'dev' && env !== 'prod') return { ok: false, status: 400, reason: "env must be 'dev' or 'prod'" };
    return { ok: true, env };
};
