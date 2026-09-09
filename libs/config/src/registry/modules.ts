import { authModule } from './auth';
import { bridgeModule } from './bridge';
import { cacheModule } from './cache';
import { debugModule } from './debug';
import { envModule } from './env';
import { featureModule } from './feature';
import { limitModule } from './limit';
import { logModule } from './log';
import { netModule } from './net';
import { syncModule } from './sync';
import { systemModule } from './system';
import { uiModule } from './ui';
import type { ConfigRegistryModule } from '../types';

/**
 * Every domain module, merged at boot.
 *
 * Split by domain because the table runs past eighty keys and one file would stop being readable.
 * A duplicate key across modules keeps the first declaration and reports the later one — the boot
 * does not fail (see `ConfigRegistry`).
 *
 * 84 keys across 12 domains (ADR-0079 결정 2 · 레지스트리 키 제안).
 */
export const ALL_MODULES: readonly ConfigRegistryModule[] = [
    systemModule,
    envModule,
    netModule,
    uiModule,
    logModule,
    debugModule,
    featureModule,
    limitModule,
    bridgeModule,
    authModule,
    syncModule,
    cacheModule,
];
