import type { WebAppReadyPayload } from '@chatic/app-messages';

/** Why the WebView was revealed — logged, so a boot that ended on a fallback is visible in the field. */
export type WebRevealReason = 'first-screen' | 'handshake' | 'load-error';

export interface IBootSplashService {
    /**
     * The WebAppReady handshake arrived. A web build that does not declare `holdsBootSplash` will
     * never send `FirstScreenReady`, so for it the handshake itself is the reveal.
     */
    onWebAppReady(payload: WebAppReadyPayload): void;
    /** The web reported its first screen painted. */
    onFirstScreenReady(): void;
    /** The page failed to load; whatever covers it must go so the failure can be seen. */
    onLoadFailed(): void;
    /**
     * Called on every reveal, after the launch splash was asked to lift. The cover a crashed WebView
     * reloads under listens here, since the same signal means its page is up too.
     */
    subscribe(listener: (reason: WebRevealReason) => void): () => void;
    /**
     * Settles once the WebView has been revealed in this process, or after `capMs` — whichever comes
     * first — so a caller that must not act under the launch splash can wait for it and never hangs.
     */
    whenRevealed(capMs?: number): Promise<void>;
}
