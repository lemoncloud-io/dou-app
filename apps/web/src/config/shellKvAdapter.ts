import { liveShellValue } from '@chatic/bridges';
import type { IShellKvAdapter } from '@chatic/config';
import { appBridge } from '../app/bridge';

export const createShellKvAdapter = (): IShellKvAdapter => ({
    readBag: () => {
        const bag = liveShellValue('CHATIC_APP_CONFIG_BAG');
        return bag && typeof bag === 'object' ? (bag as Record<string, string>) : {};
    },

    async write(key, value) {
        await appBridge.saveConfigValueConfirmed({ key, value });
    },

    async clear(key) {
        await appBridge.clearConfigValueConfirmed({ key });
    },
});
