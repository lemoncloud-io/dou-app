import { startRuntimeOn } from '@chatic/runtime-web';

import { webPlatform } from './webPlatform';

export const startRuntime = startRuntimeOn(webPlatform);
