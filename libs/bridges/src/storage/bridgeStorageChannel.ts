import type { StorageMedium } from '@chatic/bridge-messages';

import type { IWebBridgeClient } from '../web';
import type { IBridgeStorageChannel } from './types';

const READ_TIMEOUT_MS = 5_000;

/**
 * One storage medium the shell keeps, over `StorageGet` / `StorageSave` / `StorageClear`. A rejected
 * request — a shell with no such handler, or one that failed — answers a write as "not confirmed",
 * never as success; a rejected read is left to the caller, which reads it as unavailable.
 */
export class BridgeStorageChannel implements IBridgeStorageChannel {
    constructor(
        private readonly client: IWebBridgeClient,
        private readonly medium: StorageMedium
    ) {}

    /**
     * Waits at most five seconds for the answer — the shell answers from memory, so a slower one is a
     * shell that is not answering. The bridge's own timer, which holds while the page is hidden, so a
     * boot that starts in the background is not timed out by its own pause.
     */
    async read() {
        const reply = await this.client.request(
            { type: 'StorageGet', data: { medium: this.medium } },
            { timeoutMs: READ_TIMEOUT_MS }
        );
        return reply.data;
    }

    async save(set: Record<string, string>, remove: string[]): Promise<boolean> {
        try {
            const reply = await this.client.request({
                type: 'StorageSave',
                data: { medium: this.medium, set, remove },
            });
            return reply.data.ok === true;
        } catch {
            return false;
        }
    }

    async clear(): Promise<boolean> {
        try {
            return (
                (await this.client.request({ type: 'StorageClear', data: { medium: this.medium } })).data.ok === true
            );
        } catch {
            return false;
        }
    }
}
