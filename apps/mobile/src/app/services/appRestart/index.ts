import { createMMKV } from 'react-native-mmkv';

import { AppRestartBridge } from '../../bridge/AppRestartBridge';
import { provider } from '../provider';
import { createAppRestart } from './appRestart';

export type { AppRestart, RestartNote, RestartReason } from './appRestart';

/** The MMKV file the restart note waits in. Its own file, holding nothing else. */
export const APP_RESTART_STORAGE_ID = 'chatic-app-restart';

/** The app's one restart: the note it leaves, and the JS reload behind it. */
export const appRestart = createAppRestart({
    openFile: () => createMMKV({ id: APP_RESTART_STORAGE_ID }),
    reload: AppRestartBridge.reload,
    logService: provider.logService,
});
