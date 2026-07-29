// Local error helpers. These were previously imported from `@chatic/web-core`,
// but that package no longer re-exports them from its public barrel. They are
// trivial, dependency-free utilities, so we keep an app-local copy.

/** Coerce an unknown thrown value into a real Error instance. */
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * HTTP status carried by a rejected socket request, or `undefined` when the failure is unclassified.
 *
 * The `:error` frame carries `errorCode`, but chatic-sockets-lib@0.4.9 does not put it on the Error
 * it rejects with — it only keeps the server's message, which is conventionally prefixed with the
 * status (`403 FORBIDDEN - …`), as are the client's own failures (`408 REQUEST TIMEOUT - …`). So
 * read a numeric `errorCode` property when a future release starts attaching one, and otherwise
 * recover the status from that prefix.
 *
 * This exists so callers branch on the code and never on the wording: server messages are not a
 * contract and are localized/reworded freely. See relay-server-invite/05-client-guide.md §에러 코드.
 */
export const getSocketErrorCode = (error: unknown): number | undefined => {
    const carried = (error as { errorCode?: unknown } | null)?.errorCode;
    if (typeof carried === 'number') return carried;

    const leadingStatus = /^\s*([1-5]\d{2})\b/.exec(toError(error).message);
    return leadingStatus ? Number(leadingStatus[1]) : undefined;
};

/** Reject if `promise` does not settle within `ms` milliseconds. */
export const withTimeout = <T>(promise: Promise<T>, ms: number, context = 'Operation'): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`TIMEOUT: ${context} timed out (${ms}ms)`)), ms);
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
};
