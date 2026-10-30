/**
 * The HTTP-ish status a rejected socket request carries, or `undefined` when the failure is
 * unclassified.
 *
 * Two sources, in order:
 *  - A numeric `errorCode` carried on the Error. chatic-sockets-lib drops the `*:error` frame's
 *    `errorCode` when it rejects, so `SocketManager` puts it back (`errorCodeLedger`) for every request
 *    made through its facade. This is the only source for a server answer whose message has no
 *    status in front — the server codes a parameter check (`@chatNo[999] is invalid - …`) as 400
 *    without writing the 400 into the text.
 *  - Otherwise, a leading status in the message. The client's own failures are written that way
 *    (`408 REQUEST TIMEOUT - …`, `503 SOCKET NOT CONNECTED - …`, `499 CLIENT CLOSED REQUEST - …`) and
 *    never carry a code, and so is a server message that begins with its status (`403 FORBIDDEN - …`),
 *    for which the server's `errorCode` is that same number. It is also what still classifies a
 *    rejection that did not come through the facade.
 *
 * This is the convention `annotateSocketError` protects by only ever *appending* to a message and
 * rethrowing the same object: the annotator preserves both the prefix and the carried code.
 *
 * Callers branch on the number, never on the wording — server messages are not a contract and are
 * reworded and localized freely.
 *
 * **There are copies** in `apps/web/src/app/utils/errors.ts` and `apps/desktop-web`'s
 * `socketErrorStatus`, which those apps' error copy branches on (and a 404-only one in `libs/data`'s
 * `ProfileRepository`). They are not merged because the package's public surface is one facade of seven
 * groups, locked symbol by symbol (`public-surface.test.ts`), and a helper that only two files read
 * is not worth a new public name. All read the same two sources in the same order — the apps'
 * errors come out of this package's facade too — so a change to one belongs in the others.
 */
export const getSocketErrorCode = (error: unknown): number | undefined => {
    const carried = (error as { errorCode?: unknown } | null)?.errorCode;
    if (typeof carried === 'number') return carried;

    const message = error instanceof Error ? error.message : String(error ?? '');
    const leadingStatus = /^\s*([1-5]\d{2})\b/.exec(message);
    return leadingStatus ? Number(leadingStatus[1]) : undefined;
};
