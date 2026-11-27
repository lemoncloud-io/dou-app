import { PAIRED_CLOUD_CHECK_INTERVAL_MS, createPairedCloudCheck } from '@chatic/runtime/api';

import type { Booted } from '../boot';
import type { CommandContext } from '../cli';

export interface ServeHooks {
    onReady?: (booted: Booted) => void | Promise<void>;
}

export const serveCommand = async ({ io, signal, booted, hooks }: CommandContext): Promise<number> => {
    const check = createPairedCloudCheck(cloudId => io.err(`paired cloud ended: ${cloudId}`));
    const timer = setInterval(() => void check().catch(error => io.err(String(error))), PAIRED_CLOUD_CHECK_INTERVAL_MS);
    await hooks.onReady?.(booted);
    io.out(JSON.stringify({ serving: true }));
    await new Promise<void>(resolve => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
    });
    clearInterval(timer);
    await booted.stop();
    return 0;
};
