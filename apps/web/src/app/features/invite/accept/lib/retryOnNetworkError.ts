/**
 * Waits before each retry of a cloud entry that failed for want of a network round trip. Seven
 * seconds in all: the window the relay credential needs to refresh after a cold start (below).
 */
export const NETWORK_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

/**
 * A request that never got an HTTP answer. axios reports it as `Network Error` / `ERR_NETWORK`.
 *
 * Entering an invited cloud is a relay-signed `delegate-cloud`. When the app is opened cold by the
 * invite link, the relay credential is often still stale for a few seconds — the relay socket has
 * not finished re-authenticating — and every relay HTTP call fails this way, quickly, with no status.
 * Measured in production: the same Accept succeeded when pressed again a few seconds later.
 */
export const isNetworkError = (error: unknown): boolean => {
    const err = error as { message?: unknown; code?: unknown } | null;
    if (err?.code === 'ERR_NETWORK') return true;
    const message = typeof err?.message === 'string' ? err.message : '';
    return message.includes('Network Error') || message.includes('ERR_NETWORK');
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Runs `task`, retrying after each of `delays` while it keeps failing with a network error. Any
 * other failure — and the last network one — is thrown as is, so the caller's error mapping still
 * sees the real cause.
 */
export const retryOnNetworkError = async <T>(
    task: () => Promise<T>,
    {
        delays = NETWORK_RETRY_DELAYS_MS,
        wait = sleep,
    }: { delays?: readonly number[]; wait?: (ms: number) => Promise<void> } = {}
): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await task();
        } catch (error) {
            if (attempt >= delays.length || !isNetworkError(error)) throw error;
            await wait(delays[attempt]);
        }
    }
};
