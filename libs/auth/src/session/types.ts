/** Read-only questions about the relay session, answered from the session itself. Neither refreshes. */
export interface IRelayCredentialProbe {
    /** Whether a relay session exists — a relay token is stored. Says nothing about its credential. */
    hasSession(): boolean;
    /**
     * Whether the relay's signing credential has run out. One with nothing to measure — the token view
     * carries no credential — counts as run out, so the caller renews rather than signs with nothing.
     */
    isCredentialExpired(now?: number): boolean;
}
