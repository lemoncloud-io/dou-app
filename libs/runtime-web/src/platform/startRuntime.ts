import { startRuntime as startDeclaredRuntime } from '@chatic/runtime-client';
import { providePlatform } from '@chatic/runtime/api/platform';
import type { RuntimePlatform } from '@chatic/runtime/api/platform';

import { webPlatform } from './webPlatform';

export const startRuntimeOn =
    (platform: RuntimePlatform): typeof startDeclaredRuntime =>
    (declaration, options) => {
        providePlatform(platform);
        return startDeclaredRuntime(declaration, options);
    };

export const startRuntime: typeof startDeclaredRuntime = startRuntimeOn(webPlatform);
