import { getSocketErrorCode } from '../../../../utils/errors';

/**
 * A relay request that failed because there was no socket to carry it: `499` — the socket closed
 * with the request in flight, which rejects every request in flight at once — or `503` — it was
 * sent while the socket was down. Neither reached a server decision about the invite.
 *
 * The case this exists for: an SMS link that brings the iOS app back from the background. iOS
 * dropped the sockets while the WebView was suspended, but the close is only delivered after the
 * resume, so for that first moment the relay slot still reads verified, the handshake wait lets the
 * request through, and the close then fails it with `499`. The relay is back about a second later.
 */
export const isSocketGone = (error: unknown): boolean => {
    const status = getSocketErrorCode(error);
    return status === 499 || status === 503;
};

interface RetryAfterRelayReconnectOptions {
    /** Resolves `true` once the relay slot has verified again, `false` when its wait gave up. */
    waitForRelay: () => Promise<boolean>;
    /** Asked after the wait; `false` skips the retry and throws the original failure. */
    shouldRetry?: () => boolean;
    /** Told about the failure that is about to be retried, before the wait. */
    onRetry?: (error: unknown) => void;
}

/**
 * Runs `task`, and when it fails because the relay socket went away, waits for the relay to verify
 * again and runs it once more — not when the wait gives up, since the socket is still gone then.
 * Once, because a second failure means the socket did not come back, and the reader's own retry is
 * the better judge of when to try again. Any other failure — and the second one — is thrown as is,
 * so the caller's error mapping still sees the real cause.
 *
 * Only for tasks that are safe to send twice: the first attempt may have reached the server with
 * only its answer lost.
 */
export const retryAfterRelayReconnect = async <T>(
    task: () => Promise<T>,
    { waitForRelay, shouldRetry = () => true, onRetry }: RetryAfterRelayReconnectOptions
): Promise<T> => {
    try {
        return await task();
    } catch (error) {
        if (!isSocketGone(error)) throw error;
        onRetry?.(error);
        // A relay that did not come back within the wait would only fail the retry the same way.
        const relayBack = await waitForRelay();
        if (!relayBack || !shouldRetry()) throw error;
        return task();
    }
};
