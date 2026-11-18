import { config } from '@chatic/config';
import type { ConfigSnapshot } from '@chatic/config';

import {
    clearSetting,
    getSetting,
    isSettingsInitialized,
    overriddenSettingSnapshots,
    setSetting,
    settingSnapshot,
    settingSnapshots,
    subscribeSettings,
} from './settings';

const snapshot = { key: 'ui.blur', value: true } as unknown as ConfigSnapshot;

describe('settings', () => {
    afterEach(() => jest.restoreAllMocks());

    it('reads a value from the process config at call time', () => {
        // Spied after the import: a function bound at import would miss it.
        const get = jest.spyOn(config, 'get').mockReturnValue(true);

        expect(getSetting<boolean>('ui.blur')).toBe(true);
        expect(get).toHaveBeenCalledWith('ui.blur');
    });

    it('passes an unknown key through as undefined', () => {
        jest.spyOn(config, 'get').mockReturnValue(undefined);

        expect(getSetting('nothing.here')).toBeUndefined();
    });

    it('reads snapshots — one, all, and the overridden ones', () => {
        jest.spyOn(config, 'snapshot').mockReturnValue(snapshot);
        jest.spyOn(config, 'snapshotAll').mockReturnValue([snapshot]);
        jest.spyOn(config, 'overriddenSnapshots').mockReturnValue([]);

        expect(settingSnapshot('ui.blur')).toBe(snapshot);
        expect(settingSnapshots()).toEqual([snapshot]);
        expect(overriddenSettingSnapshots()).toEqual([]);
    });

    it('writes and clears through the lane it is given, returning the registry verdict', () => {
        const set = jest.spyOn(config, 'set').mockReturnValue({ ok: false, reason: 'laneNotAllowed' });
        const clear = jest.spyOn(config, 'clear').mockReturnValue({ ok: true });

        expect(setSetting('net.backend', 'https://b', { lane: 'server' })).toEqual({
            ok: false,
            reason: 'laneNotAllowed',
        });
        expect(set).toHaveBeenCalledWith('net.backend', 'https://b', { lane: 'server' });
        expect(clearSetting('ui.blur', { lane: 'local' })).toEqual({ ok: true });
        expect(clear).toHaveBeenCalledWith('ui.blur', { lane: 'local' });
    });

    it('subscribes through the process config and hands back its unsubscribe', () => {
        const unsubscribe = jest.fn();
        const subscribe = jest.spyOn(config, 'subscribe').mockReturnValue(unsubscribe);
        const listener = jest.fn();

        expect(subscribeSettings(['ui.blur'], listener)).toBe(unsubscribe);
        expect(subscribe).toHaveBeenCalledWith(['ui.blur'], listener);
    });

    it('says whether the entry point has initialised the config', () => {
        jest.spyOn(config, 'isInitialized').mockReturnValue(false);

        expect(isSettingsInitialized()).toBe(false);
    });
});
