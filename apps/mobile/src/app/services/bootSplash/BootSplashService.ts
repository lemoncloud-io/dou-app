import type { WebAppReadyPayload } from '@chatic/bridge-messages';

import type { ILogService } from '../log';
import type { IBootSplashService, WebRevealReason } from './types';

export interface BootSplashHider {
    hide(fade: boolean): Promise<boolean>;
}

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
        void this.splash.hide(true);
        this.listeners.forEach(listener => listener(reason));
    }
}
