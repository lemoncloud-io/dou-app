import { join } from 'node:path';

import type { PushHost } from '@chatic/push-desktop';

import { nodeDataDirectory } from '../profile';

export const WAKE_TICK_MS = 30_000;

export interface NodePushHost {
    host: PushHost;
    dispose(): void;
}

export const createNodePushHost = (profile: string, now: () => number = Date.now): NodePushHost => {
    const timers: ReturnType<typeof setInterval>[] = [];
    return {
        host: {
            credentialsPath: join(nodeDataDirectory(profile), 'fcm.json'),
            onWake: reconnect => {
                let last = now();
                const timer = setInterval(() => {
                    const at = now();
                    if (at - last > 2 * WAKE_TICK_MS) reconnect();
                    last = at;
                }, WAKE_TICK_MS);
                timer.unref?.();
                timers.push(timer);
            },
        },
        dispose: () => timers.splice(0).forEach(timer => clearInterval(timer)),
    };
};
