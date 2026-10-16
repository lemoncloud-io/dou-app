import type { ShellEnv } from '../server/envSwitch';

export type SwitchOutcome =
    | { ok: true; url: string }
    | { ok: false; problems: Array<{ message: string; fix?: string }> };

/**
 * Asks `yarn local`, through this shell's server, to run `env`'s pair, and says where it is once it
 * answers — or what stops it. The request carries the shell's own header; a page elsewhere cannot.
 */
export const requestEnv = async (env: ShellEnv, fetchImpl: typeof fetch = fetch): Promise<SwitchOutcome> => {
    let response: Response;
    try {
        response = await fetchImpl('/__shell/api/env', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-virtual-shell': '1' },
            body: JSON.stringify({ env }),
        });
    } catch (error) {
        return { ok: false, problems: [{ message: `the shell server did not answer: ${String(error)}` }] };
    }
    let body: { ok?: boolean; url?: string; problems?: Array<{ message: string; fix?: string }>; reason?: string };
    try {
        body = await response.json();
    } catch {
        return { ok: false, problems: [{ message: `the shell server answered ${response.status}` }] };
    }
    if (body.ok && typeof body.url === 'string') return { ok: true, url: body.url };
    return {
        ok: false,
        problems: body.problems ?? [{ message: body.reason ?? `the shell server answered ${response.status}` }],
    };
};
