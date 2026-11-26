import { startRuntime as startDeclaredRuntime } from '@chatic/runtime-client';
import { providePlatform } from '@chatic/runtime/api/platform';

import { webPlatform } from './webPlatform';

export const startRuntime: typeof startDeclaredRuntime = (declaration, options) => {
    providePlatform(webPlatform);
    return startDeclaredRuntime(declaration, options);
};
