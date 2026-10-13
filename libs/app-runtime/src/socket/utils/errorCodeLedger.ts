import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';

/** How many distinct error answers one slot remembers. Only the last few can still be in flight. */
const LEDGER_SIZE = 16;

/**
 * Puts the server's `errorCode` back on the Error a `*:error` frame rejected a request with.
 *
 * chatic-sockets-lib (`PendingRequestStore.settle`) rejects with `new Error(`${error} - ${type}`)`
 * and drops the frame's `errorCode`. A server message is not reliably prefixed with its status —
 * a parameter check answers `@chatNo[999] is invalid - …` with `errorCode: 400` — so without this a
 * real refusal reads as unclassified (`getSocketErrorCode` → `undefined`) while every client-made
 * failure (`499 …`, `503 …`, `408 …`) still classifies. Consumers that branch on the code were blind
 * to exactly the answers that come from the server.
 *
 * **Why the message text is the key.** The SDK hands nothing back that names the request a rejection
 * belongs to: `request()` takes no `mid` and the Error carries none. What it does guarantee is that
 * the frame's `message` listeners run synchronously right after `settle` rejects, so the frame is
 * observed before the rejection reaches any `catch` (those resume in microtasks). Keying by the very
 * text the SDK builds from the frame makes a match exact — the same text is the same server answer —
 * and a format change in a future SDK degrades to "no code", the behaviour before this, rather than
 * to a code on the wrong request. Entries are not removed on use: frames delivered in one task (a
 * batched bridge) can carry the same answer for two requests, and the bound keeps the memory flat.
 */
export interface ErrorCodeLedger {
    /** Feed every inbound frame; only a `*:error` answer to a request with a numeric code is kept. */
    observe(message: SocketMessage | undefined): void;
    /**
     * Sets `errorCode` on `error` when its text is a remembered answer. Mutates and returns the same
     * object, so its stack survives; a non-Error, or one already carrying a code, is left alone.
     */
    attach(error: unknown): unknown;
}

/** The exact message `PendingRequestStore.settle` rejects with for this frame. */
const rejectionMessageOf = (message: SocketMessage): string =>
    `${message.error || 'socket request failed'} - ${message.type}`;

export const createErrorCodeLedger = (): ErrorCodeLedger => {
    const codes = new Map<string, number>();
    return {
        observe(message) {
            // No `mid`, no pending request to reject — a push-shaped error frame never reaches a caller.
            if (!message?.mid || !message.type?.endsWith(':error')) return;
            if (typeof message.errorCode !== 'number') return;
            const key = rejectionMessageOf(message);
            // Re-inserting moves the key to the end, so eviction drops the oldest answer.
            codes.delete(key);
            codes.set(key, message.errorCode);
            if (codes.size > LEDGER_SIZE) codes.delete(codes.keys().next().value as string);
        },
        attach(error) {
            if (!(error instanceof Error)) return error;
            const carrier = error as Error & { errorCode?: unknown };
            if (typeof carrier.errorCode === 'number') return error;
            const code = codes.get(error.message);
            if (code !== undefined) carrier.errorCode = code;
            return error;
        },
    };
};
