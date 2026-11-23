import { SwitchableStore, TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

interface AppStorePorts {
    device: KeyValueStore;
    tab: KeyValueStore;
}

const device = new SwitchableStore(new TolerantStore(WebStore.local()));
const tab = new SwitchableStore(new TolerantStore(WebStore.session()));

export const deviceStore: KeyValueStore = device;
export const tabStore: KeyValueStore = tab;

export const configureAppStores = (next: AppStorePorts): void => {
    device.use(next.device);
    tab.use(next.tab);
};

export const resetAppStores = (): void => {
    device.reset();
    tab.reset();
};
