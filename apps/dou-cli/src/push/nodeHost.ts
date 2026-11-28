import { join } from 'node:path';

import type { PushHost } from '@chatic/push-desktop';

import { nodeDataDirectory } from '../profile';

export const WAKE_TICK_MS = 30_000;

export interface NodePushHost {
    host: PushHost;
    dispose(): void;
}

export const createNodePushHost = (profile: string, now: () => number = Date.now): NodePushHost => {
    let timer: ReturnType<typeof setInterval> | undefined;
    return {
        host: {
            credentialsPath: join(nodeDataDirectory(profile), 'fcm.json'),
            onWake: reconnect => {
                clearInterval(timer);
                let last = now();
                timer = setInterval(() => {
                    const at = now();
                    if (at - last > 2 * WAKE_TICK_MS) reconnect();
                    last = at;
                }, WAKE_TICK_MS);
                timer.unref?.();
            },
        },
        dispose: () => clearInterval(timer),
    };
};
