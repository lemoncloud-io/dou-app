// The `settings` facade group — the app's settings as its screens read and write them: a value, its
// snapshot, a write into a lane, a subscription, and the hook that re-renders on a change.
//
// A barrel and nothing else. Each name is the config facade's own method name, so `config.get(key)`
// reads `runtime.settings.get(key)`; runtime-client forwards each call to the process's one `config`
// at the moment it is made. Wiring the config — `init` and its ports — is the entry point's, and stays
// on `@chatic/config`.
export {
    clearSetting as clear,
    getSetting as get,
    isSettingsInitialized as isInitialized,
    overriddenSettingSnapshots as overriddenSnapshots,
    setSetting as set,
    settingSnapshot as snapshot,
    settingSnapshots as snapshotAll,
    subscribeSettings as subscribe,
} from '@chatic/runtime-client';
export { useConfigValue } from '@chatic/config/react';
export { CONFIG_UNLOCK_KEY, encodeValue, storageKeyFor } from '@chatic/config';
