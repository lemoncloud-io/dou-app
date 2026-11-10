import type { RelayConfig, RelayEvent, RelayReceipt, RelayScope } from './relay';

/** Retries keep the same event body; the local server owns durable message-id deduplication. */
export const createRelayTransport = (
    request: typeof fetch,
    pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
) => {
    const json = async <T>(path: string, init?: RequestInit, canSend: () => boolean = () => true): Promise<T> => {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (!canSend()) throw new Error('Local relay stopped');
            let response: Response | undefined;
            try {
                response = await request(`/__dou_mentions/${path}`, {
                    ...init,
                    cache: 'no-store',
                    credentials: 'omit',
                });
            } catch {
                if (attempt === 2) throw new Error('Local relay transport failed');
            }
            if (response && response.status < 500 && response.status !== 408 && response.status !== 429) {
                // A policy refusal is final, including a scope mismatch. Never retry it on render.
                if (!response.ok && response.status !== 409) throw new Error('Local relay refused request');
                return response.json() as Promise<T>;
            }
            if (attempt === 2) throw new Error('Local relay transport failed');
            await pause(500 * 2 ** attempt);
        }
        throw new Error('Local relay transport failed');
    };
    const post = (path: string, token: string, body: unknown, canSend?: () => boolean) =>
        json<RelayReceipt>(
            path,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-dou-mention-token': token },
                body: JSON.stringify(body),
            },
            canSend
        );
    return {
        config: () => json<RelayConfig>('config'),
        register: (token: string, scope: RelayScope, baselineChatNo: number) =>
            post('register', token, { version: 1, ...scope, baselineChatNo }),
        event: (token: string, event: RelayEvent, canSend?: () => boolean) => post('events', token, event, canSend),
    };
};
