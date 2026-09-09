import type { IKeyValueStorage } from '../../database';
import type { ILogService } from '../log';
import type { IConfigKvService } from './types';

/**
 * The generic, meaning-blind key-value store `@chatic/config`'s shell lane persists into.
 *
 * A thin namespacing wrapper over the same MMKV instance `PreferenceService` uses — the prefix is
 * what keeps a config key and an unrelated service's key from ever colliding on one flat store, and
 * what lets `getAll()` answer "just the config bag" instead of everything MMKV holds.
 *
 * **This class does not validate what it is asked to store.** The one capability that made an
 * unvalidated write dangerous — `SavePreference`'s `debugSettings`/`webviewBaseUrlOverride`, which
 * decided where the WebView loads its content from next launch — no longer exists as a config key;
 * ADR-0080 결정 13 deleted the feature outright rather than allow-list it. Everything left in the
 * registry is a display or behavior setting: a corrupted value degrades what it controls, not what
 * this WebView is allowed to load or execute. See the handler that calls this for the full note.
 */
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
