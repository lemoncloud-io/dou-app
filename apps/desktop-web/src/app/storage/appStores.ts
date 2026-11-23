import { SwitchableStore, TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

interface AppStorePorts {
    device: KeyValueStore;
    tab: KeyValueStore;
    plain: KeyValueStore;
}

const device = new SwitchableStore(new TolerantStore(WebStore.local()));
const tab = new SwitchableStore(new TolerantStore(WebStore.session()));
const plain = new SwitchableStore(WebStore.session());

export const deviceStore: KeyValueStore = device;
export const tabStore: KeyValueStore = tab;
export const plainStore: KeyValueStore = plain;

export const configureAppStores = (next: AppStorePorts): void => {
    device.use(next.device);
    tab.use(next.tab);
    plain.use(next.plain);
};
