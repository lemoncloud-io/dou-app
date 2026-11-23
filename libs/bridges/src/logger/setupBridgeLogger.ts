import { logHub } from '@chatic/logger';

import { isNative } from '../common';
import { createNativeForwarder } from './nativeForwarder';

export interface BridgeLoggerHandle {
    teardown(): void;
}

let handle: BridgeLoggerHandle | undefined;

export const setupBridgeLogger = (): BridgeLoggerHandle => {
    if (handle) return handle;

    const unsubscribes: Array<() => void> = [];

    if (isNative()) {
        unsubscribes.push(logHub.subscribe(createNativeForwarder()));
    }

    handle = {
        teardown() {
            unsubscribes.forEach(unsubscribe => unsubscribe());
            handle = undefined;
        },
    };

    return handle;
};
