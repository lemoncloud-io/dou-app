import type { PreferenceKey } from '@chatic/app-messages';
import type { IPreferenceService } from './types';
import type { ILogService } from '../log';
import type { IKeyValueStorage } from '../../database';

export class PreferenceService implements IPreferenceService {
    private readonly logService: ILogService;
    private readonly storage: IKeyValueStorage;

    constructor(logService: ILogService, storage: IKeyValueStorage) {
        this.logService = logService;
        this.storage = storage;
    }

    public async get<T = any>(key: PreferenceKey): Promise<T | null> {
        try {
            return this.storage.get<T>(key);
        } catch (error) {
            this.logService.error('Preference', `Failed to get preference: ${key}`, error as Error);
            return null;
        }
    }

    public async set<T = any>(key: PreferenceKey, value: T): Promise<void> {
        try {
            return this.storage.set(key, value);
        } catch (error) {
            this.logService.error('Preference', `Failed to set preference: ${key}`, error as Error);
        }
    }

    public async remove(key: PreferenceKey): Promise<void> {
        try {
            return this.storage.remove(key);
        } catch (error) {
            this.logService.error('Preference', `Failed to remove preference: ${key}`, error as Error);
        }
    }

    public clearAll(): void {
        try {
            this.storage.getAllKeys().forEach(k => {
                void this.storage.remove(k);
            });
        } catch (error) {
            this.logService.error('Preference', 'Failed to clear all preferences', error as Error);
        }
    }
}
