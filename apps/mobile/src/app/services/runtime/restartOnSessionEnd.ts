import type { AppRestart } from '../appRestart/appRestart';
import type { NativeRuntimeHost } from './nativeRuntimeHost';

/**
 * What the app does when a session its runtime held ends: it starts its JS context over, and the next
 * context opens the main WebView home with the address a page would have gone to (`logout=1` among it).
 *
 * A page drops everything the session left in memory by reloading — the repository graph, the sync
 * engine, the background clouds, the outboxes. The runtime has no reload of its own: the packages it
 * wires are process-wide, assembled once per JS context, so the next account would inherit them. The
 * restart is the reload, and it remounts the WebView too, so sending the page home costs no second load.
 */
export const restartOnSessionEnd = (
    host: Pick<NativeRuntimeHost, 'onSessionEnded'>,
    restart: Pick<AppRestart, 'restart'>
): (() => void) =>
    host.onSessionEnded(params => {
        void restart.restart({ reason: 'session-ended', homeSearch: params.toString() });
    });
