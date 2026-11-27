import { createMMKV } from 'react-native-mmkv';

import { AppRestartBridge } from '../../bridge/AppRestartBridge';
import { provider } from '../provider';
// eslint-disable-next-line @nx/enforce-module-boundaries -- host-mobile still reads its link and store-URL helpers from web-only shared until they move to a platform-free package
import { createAppRestart } from '@chatic/host-mobile';

// eslint-disable-next-line @nx/enforce-module-boundaries -- host-mobile still reads its link and store-URL helpers from web-only shared until they move to a platform-free package
export type { AppRestart, RestartNote, RestartReason } from '@chatic/host-mobile';

export const APP_RESTART_STORAGE_ID = 'chatic-app-restart';

export const appRestart = createAppRestart({
    openFile: () => createMMKV({ id: APP_RESTART_STORAGE_ID }),
    reload: AppRestartBridge.reload,
    logService: provider.logService,
});
