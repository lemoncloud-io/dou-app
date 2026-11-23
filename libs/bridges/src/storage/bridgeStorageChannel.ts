import type { StorageMedium } from '@chatic/bridge-messages';

import type { IWebBridgeClient } from '../web';
import type { IBridgeStorageChannel } from './types';

const READ_TIMEOUT_MS = 5_000;

export class BridgeStorageChannel implements IBridgeStorageChannel {
    constructor(
        private readonly client: IWebBridgeClient,
        private readonly medium: StorageMedium
    ) {}

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
