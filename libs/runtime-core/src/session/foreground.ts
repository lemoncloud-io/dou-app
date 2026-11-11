/**
 * Whether the app is in front of the user, and a way to hear it change.
 *
 * The session's background work and push registration re-try on this edge: a page that comes back from a hidden tab or a
 * slept laptop, a native app that returns from the background. Either may have missed the network
 * coming back while it was away, and timers in a suspended page fire late or not at all — so the
 * return to the foreground is the moment to ask again.
 *
 * A page reads `document.visibilityState` (filled by `createWebRuntime` in `@chatic/runtime-web`); a native
 * runtime reads its app state.
 */
export interface ForegroundSignal {
    /** `true` while the app is in front of the user. */
    read(): boolean;
    /** Calls `listener` whenever the answer may have changed. Returns the unsubscribe. */
    subscribe(listener: () => void): () => void;
}

export interface IForegroundPlatform {
    /**
     * Points the runtime at the platform's foreground signal. Called by the runtime's assembly before
     * the host starts the session controller. Assignment, so a second call (HMR) replaces rather than
     * accumulates.
     */
    configure(signal: ForegroundSignal): void;
    /** The signal as configured. Throws until `configure` has run: there is no default to fall back on. */
    ports(): ForegroundSignal;
}

class ForegroundPlatform implements IForegroundPlatform {
    private configured: ForegroundSignal | null = null;

    configure(signal: ForegroundSignal): void {
        this.configured = signal;
    }

    ports(): ForegroundSignal {
        if (!this.configured) {
            throw new Error(
                '[runtime-core] the foreground signal was used before it was configured — the entry point ' +
                    'has to pass `foreground` to createRuntime().'
            );
        }
        return this.configured;
    }
}

/**
 * The foreground signal the runtime was built with (`createWebRuntime` fills it in a page). A default would be
 * the page's visibility, which a native process does not have; an unwired runtime fails at the first
 * use instead.
 */
export const foregroundPlatform: IForegroundPlatform = new ForegroundPlatform();
