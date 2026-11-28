import type { IKeyValueStorage } from '@chatic/storage-mmkv';
import type { ILogService } from '../log';
import type { IConfigKvService } from './types';

export class ConfigKvService implements IConfigKvService {
    private static readonly KEY_PREFIX = 'config:';

    private readonly logService: ILogService;
    private readonly storage: IKeyValueStorage;

    constructor(logService: ILogService, storage: IKeyValueStorage) {
        this.logService = logService;
        this.storage = storage;
    }

    getAll(): Record<string, string> {
        const bag: Record<string, string> = {};
        try {
            for (const storageKey of this.storage.getAllKeys()) {
                if (!storageKey.startsWith(ConfigKvService.KEY_PREFIX)) continue;
                const key = storageKey.slice(ConfigKvService.KEY_PREFIX.length);
                const value = this.storage.getSync<string>(storageKey);
                if (value !== null) bag[key] = value;
            }
        } catch (error) {
            this.logService.error('CONFIG', 'Failed to read config bag', error as Error);
        }
        return bag;
    }

    async set(key: string, value: string): Promise<void> {
        try {
            await this.storage.set(ConfigKvService.KEY_PREFIX + key, value);
        } catch (error) {
            this.logService.error('CONFIG', `Failed to set config value: ${key}`, error as Error);
            throw error;
        }
    }

    async remove(key: string): Promise<void> {
        try {
            await this.storage.remove(ConfigKvService.KEY_PREFIX + key);
        } catch (error) {
            this.logService.error('CONFIG', `Failed to remove config value: ${key}`, error as Error);
            throw error;
        }
    }
}
