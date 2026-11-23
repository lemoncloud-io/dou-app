import { authModule } from './auth';
import { bridgeModule } from './bridge';
import { cacheModule } from './cache';
import { debugModule } from './debug';
import { envModule } from './env';
import { featureModule } from './feature';
import { limitModule } from './limit';
import { logModule } from './log';
import { netModule } from './net';
import { portModule } from './port';
import { syncModule } from './sync';
import { systemModule } from './system';
import { uiModule } from './ui';
import type { ConfigRegistryModule } from '../types';

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
    portModule,
];
