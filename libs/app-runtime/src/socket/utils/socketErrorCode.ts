/**
 * The HTTP-ish status a rejected socket request carries, or `undefined` when the failure is
 * unclassified.
 *
 * A `*:error` frame carries `errorCode`, but chatic-sockets-lib does not put it on the Error it
 * rejects with — it keeps only the server's message, which is conventionally prefixed with the
 * status (`403 FORBIDDEN - …`), as are the client's own failures (`408 REQUEST TIMEOUT - …`,
 * `503 SOCKET NOT CONNECTED - …`, `499 CLIENT CLOSED REQUEST - …`). So read a numeric `errorCode`
 * when a future release starts attaching one, and otherwise recover the status from that prefix.
 *
 * This is the same convention `annotateSocketError` protects by only ever *appending* to a message.
 * The two are neighbours for that reason: the annotator preserves the prefix this reads.
 *
 * Callers branch on the number, never on the wording — server messages are not a contract and are
 * reworded and localized freely.
 *
 * **There is a second copy** in `apps/web/src/app/utils/errors.ts`, which the web's error copy
 * branches on. They are not merged because the package's public surface is one facade of seven
 * groups, locked symbol by symbol (`public-surface.test.ts`), and a helper that only two files read
 * is not worth a new public name. Both read the same leading-status convention, so a change to one
 * belongs in the other.
 */
export const getSocketErrorCode = (error: unknown): number | undefined => {
    const carried = (error as { errorCode?: unknown } | null)?.errorCode;
    if (typeof carried === 'number') return carried;

    const message = error instanceof Error ? error.message : String(error ?? '');
    const leadingStatus = /^\s*([1-5]\d{2})\b/.exec(message);
    return leadingStatus ? Number(leadingStatus[1]) : undefined;
};
