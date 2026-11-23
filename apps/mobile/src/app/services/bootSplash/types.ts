import type { WebAppReadyPayload } from '@chatic/bridge-messages';

export type WebRevealReason = 'first-screen' | 'handshake' | 'load-error';

export interface IBootSplashService {
    onWebAppReady(payload: WebAppReadyPayload): void;
    onFirstScreenReady(): void;
    onLoadFailed(): void;
    subscribe(listener: (reason: WebRevealReason) => void): () => void;
    whenRevealed(capMs?: number): Promise<void>;
}
