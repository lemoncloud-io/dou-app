import type { WebAppReadyPayload } from '@chatic/app-messages';

import type { ILogService } from '../log';
import type { IBootSplashService, WebRevealReason } from './types';

export interface BootSplashHider {
    hide(fade: boolean): Promise<boolean>;
}

/**
 * Decides when the WebView is worth showing, and tells whatever covers it.
 *
 * The launch splash is the only screen in the product that shows the logo, so it stays until the
 * web has painted a real screen — not merely loaded its HTML, which would hand over to a blank page
 * and read as the splash blinking out and back. Every reveal reaches the native side: hiding is
 * idempotent there, and on Android a warm start re-arms the splash in `onCreate`, so remembering an
 * earlier reveal here would leave that second splash up until its cap.
 */
/** Matches the native splash's own safety cap: past it there is no splash left to wait for. */
export const REVEAL_WAIT_CAP_MS = 5000;

export class BootSplashService implements IBootSplashService {
    private readonly listeners = new Set<(reason: WebRevealReason) => void>();
    private revealed = false;

    constructor(
        private readonly logger: ILogService,
        private readonly splash: BootSplashHider
    ) {}

    onWebAppReady(payload: WebAppReadyPayload): void {
        if (payload.holdsBootSplash) return;
        this.reveal('handshake');
    }

    onFirstScreenReady(): void {
        this.reveal('first-screen');
    }

    onLoadFailed(): void {
        this.reveal('load-error');
    }

    subscribe(listener: (reason: WebRevealReason) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    whenRevealed(capMs: number = REVEAL_WAIT_CAP_MS): Promise<void> {
        if (this.revealed) return Promise.resolve();
        return new Promise(resolve => {
            // Neither callback can run before both constants exist: a reveal arrives later, never
            // synchronously from subscribe.
            const finish = () => {
                clearTimeout(timer);
                unsubscribe();
                resolve();
            };
            const unsubscribe = this.subscribe(finish);
            const timer = setTimeout(finish, capMs);
        });
    }

    private reveal(reason: WebRevealReason): void {
        this.revealed = true;
        this.logger.info('WEBVIEW', `[bootSplash] reveal: ${reason}`);
        // Faded where the platform allows it (iOS; Android keeps the system's own exit): in the common
        // case the frames either side differ (logo → first screen), and on iOS an
        // OS-light/app-dark user also crosses a colour change here that cannot be avoided.
        void this.splash.hide(true);
        this.listeners.forEach(listener => listener(reason));
    }
}
