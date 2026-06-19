import { logger } from '@chatic/bridges';
import type { DataRepositories } from '@chatic/data';

import { getDataManager } from '../data/runtime';
import type { IDataManager } from '../data/types';
import { getSocketManager, getSocketRuntime } from '../socket/runtime';
import type { ISocketManager } from '../socket/types';
import type { RuntimeBinding } from './useRuntimeBinding';

export interface IRuntimeManager {
    ensure(binding: RuntimeBinding): void;
    bootstrap(binding: RuntimeBinding): Promise<void>;
    getRepositories(): DataRepositories;
}

export class RuntimeManager implements IRuntimeManager {
    private currentBindingKey: string | null = null;

    constructor(
        private readonly dataManager: IDataManager = getDataManager(),
        private readonly socketManager: ISocketManager = getSocketManager()
    ) {}

    public ensure(binding: RuntimeBinding): void {
        this.currentBindingKey = this.createBindingKey(binding);
        this.dataManager.ensure(binding.context);

        if (!binding.socket) {
            this.socketManager.destroy();
            return;
        }

        this.socketManager.ensure(binding.socket.config, binding.socket.scope);
    }

    public async bootstrap(binding: RuntimeBinding): Promise<void> {
        const socketBinding = binding.socket;
        if (!socketBinding) return;

        const bindingKey = this.createBindingKey(binding);
        if (bindingKey !== this.currentBindingKey) return;

        try {
            const socketRuntime = getSocketRuntime();
            await socketRuntime.controller.bootstrap(socketBinding.config, socketBinding.scope);
        } catch (error) {
            logger.error('RUNTIME', '[RuntimeManager] Failed to bootstrap runtime binding', {
                error,
                data: { cloudId: binding.context.cid, wssType: socketBinding.config.wssType },
            });
        }
    }

    public getRepositories(): DataRepositories {
        return this.dataManager.getRepositories();
    }

    private createBindingKey(binding: RuntimeBinding): string {
        return JSON.stringify({
            context: binding.context,
            socket: binding.socket
                ? {
                      config: binding.socket.config,
                      scope: binding.socket.scope,
                  }
                : null,
        });
    }
}

let runtimeManagerSingleton: IRuntimeManager | null = null;

export const getRuntimeManager = (): IRuntimeManager => {
    if (!runtimeManagerSingleton) {
        runtimeManagerSingleton = new RuntimeManager();
    }
    return runtimeManagerSingleton;
};
