import { PAIRED_CLOUD_CHECK_INTERVAL_MS, createPairedCloudCheck } from '@chatic/runtime/api';

import type { Booted } from '../boot';
import type { CommandContext } from '../cli';

export interface ServeHooks {
    onReady?: (
        booted: Booted,
        profile: string,
        env: Record<string, string | undefined>
    ) => void | (() => Promise<void>) | Promise<void | (() => Promise<void>)>;
}

export const serveCommand = async ({ io, signal, booted, hooks, profile, env }: CommandContext): Promise<number> => {
    const check = createPairedCloudCheck(cloudId => io.err(`paired cloud ended: ${cloudId}`));
    const timer = setInterval(() => void check().catch(error => io.err(String(error))), PAIRED_CLOUD_CHECK_INTERVAL_MS);
    let dispose: void | (() => Promise<void>) = undefined;
    try {
        dispose = await hooks.onReady?.(booted, profile, env);
        io.out(JSON.stringify({ serving: true }));
        await new Promise<void>(resolve => {
            if (signal.aborted) return resolve();
            signal.addEventListener('abort', () => resolve(), { once: true });
        });
    } finally {
        clearInterval(timer);
        try {
            await dispose?.();
        } finally {
            await booted.stop();
        }
    }
    return 0;
};
