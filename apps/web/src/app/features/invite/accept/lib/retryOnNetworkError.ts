export const NETWORK_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

export const isNetworkError = (error: unknown): boolean => {
    const err = error as { message?: unknown; code?: unknown } | null;
    if (err?.code === 'ERR_NETWORK') return true;
    const message = typeof err?.message === 'string' ? err.message : '';
    return message.includes('Network Error') || message.includes('ERR_NETWORK');
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

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
