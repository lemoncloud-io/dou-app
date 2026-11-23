import { config } from '@chatic/config';
import type { ConfigChangeListener, ConfigSnapshot, SetOptions, SetResult } from '@chatic/config';

export const getSetting = <T>(key: string): T | undefined => config.get<T>(key);

export const settingSnapshot = <T>(key: string): ConfigSnapshot<T> | undefined => config.snapshot<T>(key);

export const settingSnapshots = (): readonly ConfigSnapshot[] => config.snapshotAll();

export const overriddenSettingSnapshots = (): readonly ConfigSnapshot[] => config.overriddenSnapshots();

export const setSetting = (key: string, value: unknown, options: SetOptions): SetResult =>
    config.set(key, value, options);

export const clearSetting = (key: string, options: SetOptions): SetResult => config.clear(key, options);

export const subscribeSettings = (keys: readonly string[] | undefined, listener: ConfigChangeListener): (() => void) =>
    config.subscribe(keys, listener);

export const isSettingsInitialized = (): boolean => config.isInitialized();
