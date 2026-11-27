// eslint-disable-next-line @nx/enforce-module-boundaries -- host-mobile still reads its link and store-URL helpers from web-only shared until they move to a platform-free package
import type { AppRestart } from '@chatic/host-mobile';
import type { NativeRuntimeHost } from './nativeRuntimeHost';

export const restartOnSessionEnd = (
    host: Pick<NativeRuntimeHost, 'onSessionEnded'>,
    restart: Pick<AppRestart, 'restart'>
): (() => void) =>
    host.onSessionEnded(params => {
        void restart.restart({ reason: 'session-ended', homeSearch: params.toString() });
    });
