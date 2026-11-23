import type { AppRestart } from '../appRestart/appRestart';
import type { NativeRuntimeHost } from './nativeRuntimeHost';

export const restartOnSessionEnd = (
    host: Pick<NativeRuntimeHost, 'onSessionEnded'>,
    restart: Pick<AppRestart, 'restart'>
): (() => void) =>
    host.onSessionEnded(params => {
        void restart.restart({ reason: 'session-ended', homeSearch: params.toString() });
    });
