import type { MMKV } from 'react-native-mmkv';
import { createMMKV } from 'react-native-mmkv';
import type { IKeyValueStorage } from '../types';
import type { ILogService } from '../../services';

export class MmkvStorage implements IKeyValueStorage {
    private readonly _mmkv: MMKV;
    private readonly logService: ILogService;

    constructor(logService: ILogService) {
        this._mmkv = createMMKV();
        this.logService = logService;
    }

    public async set<T>(key: string, value: T): Promise<void> {
        try {
            const jsonValue = JSON.stringify(value);
            this._mmkv.set(key, jsonValue);
        } catch (e) {
            this.logService.error('STORAGE', `Set error for key: ${key}`, e as Error);
        }
    }

    public async get<T>(key: string): Promise<T | null> {
        try {
            const jsonValue = this._mmkv.getString(key);
            return jsonValue != null ? (JSON.parse(jsonValue) as T) : null;
        } catch (e) {
            this.logService.error('STORAGE', `JSON Parsing Error for key: ${key}`, e as Error);
            return null;
        }
    }

    public async remove(key: string): Promise<void> {
        try {
            this._mmkv.remove(key);
        } catch (e) {
            this.logService.error('STORAGE', `Remove error for key: ${key}`, e as Error);
        }
    }

    public async clearAll(): Promise<void> {
        try {
            this._mmkv.clearAll();
        } catch (e) {
            this.logService.error('STORAGE', 'Clear all error.', e as Error);
        }
    }

    public getAllKeys(): string[] {
        try {
            return this._mmkv.getAllKeys();
        } catch (e) {
            this.logService.error('STORAGE', 'Get all keys error.', e as Error);
            return [];
        }
    }
}
