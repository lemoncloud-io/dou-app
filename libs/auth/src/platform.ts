/**
 * What the session's use cases take from the platform about where the app is open.
 *
 * Ending a session is a navigation in a page — the document is replaced by the home page with
 * `?logout=1`, and the next document's boot finishes the clean-up — and the boot reads that flag back
 * off the address. A native process has no address bar and no document to replace; it ends a session
 * its own way. So the address is a port the platform fills; what to clear, and which parameters
 * survive, stays here.
 *
 * The user agent the socket signature is computed over is not here. It is the transport's
 * `device().userAgent` — the same value a native socket sends on its handshake — so the signature and
 * the handshake read one string and cannot drift apart.
 */
export interface AuthPlatformPorts {
    /** The query string the app was opened with, `?` included or empty — `location.search` in a page. */
    currentSearch(): string;
    /**
     * Leaves the ended session for the app's home, carrying `params` — a page replaces its document
     * with `/?<params>`, so the history keeps no signed-in entry to go back to.
     */
    leaveToHome(params: URLSearchParams): void;
}

export interface IAuthPlatform {
    /**
     * Points the package at its platform. Called by the runtime's assembly, before the boot reads the
     * logout flag. Assignment, so a second call (HMR) replaces rather than accumulates.
     */
    configure(ports: AuthPlatformPorts): void;
    /** The ports as configured. Throws until `configure` has run: there is no platform to fall back on. */
    ports(): AuthPlatformPorts;
}

class AuthPlatform implements IAuthPlatform {
    private configured: AuthPlatformPorts | null = null;

    configure(ports: AuthPlatformPorts): void {
        this.configured = ports;
    }

    ports(): AuthPlatformPorts {
        if (!this.configured) {
            throw new Error(
                '[auth] the platform ports were used before any were configured — the entry point has to pass ' +
                    '`auth` to createRuntime() before a session ends or the boot reads the logout flag.'
            );
        }
        return this.configured;
    }
}

/**
 * The process-wide platform. A default would be a page's `window.location`, which a native process
 * does not have; an unwired runtime fails at the first use instead.
 */
export const authPlatform: IAuthPlatform = new AuthPlatform();
