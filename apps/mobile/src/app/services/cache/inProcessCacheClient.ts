import type { WebMessageData, WebMessageResponse, WebMessageType } from '@chatic/bridge-messages';
import type { CacheBridgeClient } from '@chatic/db';

import type { CacheMessageHandlers, CacheMessageType } from './cacheMessages';

export const IN_PROCESS_CACHE_TIMEOUT_MS = 10_000;

const isCacheMessage = (handlers: CacheMessageHandlers, type: WebMessageType): type is CacheMessageType =>
    Object.prototype.hasOwnProperty.call(handlers, type);

export const createInProcessCacheClient = (
    handlers: CacheMessageHandlers,
    { timeoutMs = IN_PROCESS_CACHE_TIMEOUT_MS }: { timeoutMs?: number } = {}
): CacheBridgeClient => ({
    request: <K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageResponse<K>> => {
        if (!isCacheMessage(handlers, message.type)) {
            return Promise.reject({
                code: 'NOT_FOUND',
                message: `No handler registered for message type: ${message.type}`,
                reason: 'No handler is registered for the incoming WebMessage type.',
                recoverable: true,
            });
        }
        const handle = handlers[message.type] as (message: WebMessageData<K>) => Promise<{
            success: boolean;
            error?: unknown;
        }>;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject({
                        code: 'TIMEOUT',
                        message: `Request timed out after ${timeoutMs}ms`,
                        reason: 'No response was received before the configured timeout.',
                        requestType: message.type,
                        recoverable: true,
                    }),
                timeoutMs
            );
            handle(message).then(
                response => {
                    clearTimeout(timer);
                    if (response.success) resolve(response as unknown as WebMessageResponse<K>);
                    else reject(response.error);
                },
                error => {
                    clearTimeout(timer);
                    reject(error);
                }
            );
        });
    },
});
