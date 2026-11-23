import { createMMKV } from 'react-native-mmkv';

import { AppRestartBridge } from '../../bridge/AppRestartBridge';
import { provider } from '../provider';
import { createAppRestart } from './appRestart';

export type { AppRestart, RestartNote, RestartReason } from './appRestart';

export const APP_RESTART_STORAGE_ID = 'chatic-app-restart';

export const appRestart = createAppRestart({
    openFile: () => createMMKV({ id: APP_RESTART_STORAGE_ID }),
    reload: AppRestartBridge.reload,
    logService: provider.logService,
});
