import type { ConfigRegistryModule } from '../types';

/**
 * Every domain module, merged at boot.
 *
 * Split by domain because the table runs past eighty keys and one file would stop being readable.
 * A duplicate key across modules keeps the first declaration and reports the later one — the boot
 * does not fail (see `ConfigRegistry`).
 *
 * Empty for now: the 84 keys land in step 2, one file per domain
 * (`system env net ui log debug feature limit bridge auth sync cache`).
 */
export const ALL_MODULES: readonly ConfigRegistryModule[] = [];
