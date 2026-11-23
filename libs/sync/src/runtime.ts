import { getSocketManager } from '@chatic/transport';
import { BackgroundReceiver } from './BackgroundReceiver';
import { SyncManager } from './SyncManager';

import type { ISyncManager } from './types';

let syncManagerSingleton: ISyncManager | null = null;

export const getSyncManager = (): ISyncManager => {
    if (!syncManagerSingleton) {
        syncManagerSingleton = new SyncManager(getSocketManager());
    }
    return syncManagerSingleton;
};

let backgroundReceiver: BackgroundReceiver | null = null;

export const startBackgroundReceive = (): (() => void) => {
    backgroundReceiver?.destroy();
    const receiver = new BackgroundReceiver(getSocketManager());
    backgroundReceiver = receiver;
    return () => {
        receiver.destroy();
        if (backgroundReceiver === receiver) backgroundReceiver = null;
    };
};

export const refreshBackgroundClouds = (cid?: string): void => {
    backgroundReceiver?.receiveNow(cid);
};
