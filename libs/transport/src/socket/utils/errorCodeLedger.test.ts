import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { SocketLike, SocketMessage } from '@lemoncloud/chatic-sockets-lib';

import { createErrorCodeLedger } from './errorCodeLedger';
import { getSocketErrorCode } from './socketErrorCode';

/** The frame the dev relay answered an overflowing `chat.read` with (2026-10-13). */
const OVERFLOW_FRAME: SocketMessage = {
    type: 'chat.read:error',
    mid: 'm-1',
    data: null,
    error: '@chatNo[999] is invalid - overflow[5]',
    errorCode: 400,
};

/** What chatic-sockets-lib rejects the request with for that frame. */
const overflowRejection = (): Error => new Error('@chatNo[999] is invalid - overflow[5] - chat.read:error');

describe('createErrorCodeLedger', () => {
    it('puts a server answer’s errorCode back on the Error the SDK rejected with', () => {
        const ledger = createErrorCodeLedger();
        ledger.observe(OVERFLOW_FRAME);

        const error = overflowRejection();
        expect(getSocketErrorCode(error)).toBeUndefined();

        expect(ledger.attach(error)).toBe(error);
        expect(getSocketErrorCode(error)).toBe(400);
    });

    it('matches a frame with no error text by the SDK’s fallback wording', () => {
        const ledger = createErrorCodeLedger();
        ledger.observe({ type: 'invite.get:error', mid: 'm-2', data: null, errorCode: 404 });

        const error = ledger.attach(new Error('socket request failed - invite.get:error'));

        expect(getSocketErrorCode(error)).toBe(404);
    });

    it('leaves client-made failures unchanged: their status is already in front, and no frame names them', () => {
        const ledger = createErrorCodeLedger();
        ledger.observe(OVERFLOW_FRAME);

        for (const message of [
            '499 CLIENT CLOSED REQUEST - client destroyed',
            '503 SOCKET NOT CONNECTED - WebSocketTransport.send()',
            '408 REQUEST TIMEOUT - chat.read[m-1]',
        ]) {
            const error = ledger.attach(new Error(message)) as Error & { errorCode?: number };
            expect(error.errorCode).toBeUndefined();
            expect(error.message).toBe(message);
            expect(getSocketErrorCode(error)).toBe(Number(message.slice(0, 3)));
        }
    });

    it('keeps only frames that can have rejected a request with a code', () => {
        const ledger = createErrorCodeLedger();
        // An ok answer, an error with no `mid` to settle, and an error with no numeric code.
        ledger.observe({ type: 'chat.read:ok', mid: 'm-3', data: null, error: 'x', errorCode: 400 });
        ledger.observe({ type: 'chat.read:error', data: null, error: 'no mid', errorCode: 400 });
        ledger.observe({ type: 'chat.read:error', mid: 'm-4', data: null, error: 'no code' });
        ledger.observe(undefined);

        for (const message of ['x - chat.read:ok', 'no mid - chat.read:error', 'no code - chat.read:error']) {
            expect((ledger.attach(new Error(message)) as { errorCode?: number }).errorCode).toBeUndefined();
        }
    });

    it('does not overwrite a code the Error already carries, and passes a non-Error through', () => {
        const ledger = createErrorCodeLedger();
        ledger.observe(OVERFLOW_FRAME);

        const carried = Object.assign(overflowRejection(), { errorCode: 409 });
        expect(getSocketErrorCode(ledger.attach(carried))).toBe(409);

        const plain = { message: OVERFLOW_FRAME.error };
        expect(ledger.attach(plain)).toBe(plain);
        expect(plain).not.toHaveProperty('errorCode');
    });

    it('answers the same text for every request it rejected, not only the first', () => {
        const ledger = createErrorCodeLedger();
        ledger.observe(OVERFLOW_FRAME);
        ledger.observe({ ...OVERFLOW_FRAME, mid: 'm-9' });

        expect(getSocketErrorCode(ledger.attach(overflowRejection()))).toBe(400);
        expect(getSocketErrorCode(ledger.attach(overflowRejection()))).toBe(400);
    });

    it('forgets the oldest answer once it holds sixteen', () => {
        const ledger = createErrorCodeLedger();
        ledger.observe(OVERFLOW_FRAME);
        for (let i = 0; i < 16; i += 1) {
            ledger.observe({ type: 'chat.read:error', mid: `m-${i}`, data: null, error: `e${i}`, errorCode: 403 });
        }

        expect(getSocketErrorCode(ledger.attach(overflowRejection()))).toBeUndefined();
        expect(getSocketErrorCode(ledger.attach(new Error('e15 - chat.read:error')))).toBe(403);
    });
});

/**
 * The ledger leans on two things the SDK does but does not promise: the exact text it rejects with,
 * and running `onMessage` listeners before the rejection reaches a `catch`. This drives the real
 * client over a fake socket, so an SDK upgrade that changes either fails here rather than silently
 * turning server refusals back into unclassified failures.
 */
describe('createErrorCodeLedger against chatic-sockets-lib', () => {
    const OPEN = 1;

    const makeSocket = () => {
        const listeners = new Map<string, Set<(event?: unknown) => void>>();
        const sent: string[] = [];
        const socket: SocketLike & { emit(type: string, event?: unknown): void } = {
            readyState: OPEN,
            send: data => {
                sent.push(data);
            },
            close: () => undefined,
            addEventListener: (type, listener) => {
                const forType = listeners.get(type) ?? new Set();
                forType.add(listener);
                listeners.set(type, forType);
            },
            removeEventListener: (type, listener) => {
                listeners.get(type)?.delete(listener);
            },
            emit: (type, event) => listeners.get(type)?.forEach(listener => listener(event)),
        };
        return { socket, sent };
    };

    it('recovers the code for a request the server refused', async () => {
        const { socket, sent } = makeSocket();
        const client = createClientSocketV2({
            url: 'wss://example.test/socket',
            socketFactory: () => socket,
            auth: false,
            keepAlive: false,
            reconnect: false,
        });
        const ledger = createErrorCodeLedger();
        client.onMessage(event => ledger.observe(event.message));

        const connecting = client.connect();
        socket.emit('open');
        await connecting;

        const refused = client
            .request('chat.read', { channelId: 'ch-1', chatNo: 999 })
            .catch((error: unknown) => ledger.attach(error));
        const { mid } = JSON.parse(sent[sent.length - 1]) as { mid: string };
        socket.emit('message', { data: JSON.stringify({ ...OVERFLOW_FRAME, mid }) });

        const error = (await refused) as Error;
        expect(error.message).toBe('@chatNo[999] is invalid - overflow[5] - chat.read:error');
        expect(getSocketErrorCode(error)).toBe(400);

        client.destroy();
    });
});
