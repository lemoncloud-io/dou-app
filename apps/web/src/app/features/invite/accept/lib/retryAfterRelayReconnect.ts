import { getSocketErrorCode } from '../../../../utils/errors';

export const isSocketGone = (error: unknown): boolean => {
    const status = getSocketErrorCode(error);
    return status === 499 || status === 503;
};

interface RetryAfterRelayReconnectOptions {
    waitForRelay: () => Promise<boolean>;
    shouldRetry?: () => boolean;
    onRetry?: (error: unknown) => void;
}

export const retryAfterRelayReconnect = async <T>(
    task: () => Promise<T>,
    { waitForRelay, shouldRetry = () => true, onRetry }: RetryAfterRelayReconnectOptions
): Promise<T> => {
    try {
        return await task();
    } catch (error) {
        if (!isSocketGone(error)) throw error;
        onRetry?.(error);
        const relayBack = await waitForRelay();
        if (!relayBack || !shouldRetry()) throw error;
        return task();
    }
};
