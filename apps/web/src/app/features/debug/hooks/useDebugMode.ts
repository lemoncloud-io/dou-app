import { useCallback, useSyncExternalStore } from 'react';

import { liveShellValue } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';

import { DEBUG_STORAGE_KEY, DEBUG_OVERLAY_KEY as OVERLAY_KEY } from '../consts';
import { tabStore } from '../../../storage';

const readInjectedFlag = () => liveShellValue('CHATIC_APP_DEBUG_MODE') === true;

const readStagePolicy = () => runtime.settings.get<boolean>('debug.overlayEnabled') === true;

const readEnabled = () => tabStore.get(DEBUG_STORAGE_KEY) === 'true' || readInjectedFlag() || readStagePolicy();

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const unsubscribeConfig = runtime.settings.subscribe(['debug.overlayEnabled'], listener);
    return () => {
        listeners.delete(listener);
        unsubscribeConfig();
    };
};
const notify = () => listeners.forEach(listener => listener());

export const setDebugModeEnabled = (enabled: boolean) => {
    if (enabled) tabStore.set(DEBUG_STORAGE_KEY, 'true');
    else tabStore.remove(DEBUG_STORAGE_KEY);
    if (enabled) runtime.settings.set(OVERLAY_KEY, true, { lane: 'local' });
    else runtime.settings.set(OVERLAY_KEY, false, { lane: 'local' });
    if (enabled) runtime.settings.set(runtime.settings.CONFIG_UNLOCK_KEY, true, { lane: 'local' });
    else runtime.settings.clear(runtime.settings.CONFIG_UNLOCK_KEY, { lane: 'local' });
    runtime.diagnostics.debugMode?.set(enabled);
    notify();
};

export const useDebugMode = () => {
    const isEnabled = useSyncExternalStore(subscribe, readEnabled);

    const disable = useCallback(() => {
        setDebugModeEnabled(false);
    }, []);

    return { isEnabled, disable };
};
