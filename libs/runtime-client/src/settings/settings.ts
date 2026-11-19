import { config } from '@chatic/config';
import type { ConfigChangeListener, ConfigSnapshot, SetOptions, SetResult } from '@chatic/config';

// The config facade as the call part of an app reads and writes it: `runtime.settings` in
// `@chatic/runtime` re-exports these under the facade's own method names. Each one forwards to the
// process's one `config`, at the moment it is called — never a copy, and never bound at import — so a
// value written through `config` reads back here, and a test that spies on `config` sees these calls.
//
// What stays off this list is the declaration part's: `init` and the remote lane's payload are the
// entry point's to wire, and it reaches them through `@chatic/config` itself.

/** A setting's value, from the highest lane that holds one. */
export const getSetting = <T>(key: string): T | undefined => config.get<T>(key);

/** A setting's value with the lane it came from and the lanes below it. */
export const settingSnapshot = <T>(key: string): ConfigSnapshot<T> | undefined => config.snapshot<T>(key);

/** Every registered setting's snapshot. */
export const settingSnapshots = (): readonly ConfigSnapshot[] => config.snapshotAll();

/** The snapshots of the settings some lane overrides. */
export const overriddenSettingSnapshots = (): readonly ConfigSnapshot[] => config.overriddenSnapshots();

/** Writes a setting into the lane `options` names; the result says whether the registry took it. */
export const setSetting = (key: string, value: unknown, options: SetOptions): SetResult =>
    config.set(key, value, options);

/** Removes a lane's value for a setting. */
export const clearSetting = (key: string, options: SetOptions): SetResult => config.clear(key, options);

/** Calls `listener` when one of `keys` — or any setting, without `keys` — changes. Returns the unsubscribe. */
export const subscribeSettings = (keys: readonly string[] | undefined, listener: ConfigChangeListener): (() => void) =>
    config.subscribe(keys, listener);

/** Whether the entry point has initialised the config facade. */
export const isSettingsInitialized = (): boolean => config.isInitialized();
