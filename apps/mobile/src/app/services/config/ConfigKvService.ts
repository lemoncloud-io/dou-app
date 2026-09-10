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
 * **This class does not validate what it is asked to store.** What makes that safe is the
 * `config:` prefix above, not trust in the caller: every key this class touches is namespaced, so a
 * write can never land on `debugSettings` — the zustand-persist key holding
 * `webviewBaseUrlOverride`, which decides where the WebView loads its content from next launch
 * (`debugSettingsStore.ts`). That is the one capability an unvalidated write could otherwise abuse,
 * and no registry key exposes it either: `libs/config` declares only the read-only
 * `env.webviewBaseUrl`. Everything the registry does expose is a display or behavior setting, so a
 * corrupted value degrades what it controls, not what this WebView may load or execute.
 *
 * ADR-0080 결정 13's deletion has since landed: `EnvironmentSettingsScreen` is gone (2026-09-10),
 * so nothing offers the switcher any more. `setWebviewBaseUrlOverride` still EXISTS on the store
 * with no caller, though — so the isolation above is still what holds, and the prefix must not be
 * weakened (nor a writable `debug.webviewBaseUrl` key added) on the assumption that it cannot be
 * reached.
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
