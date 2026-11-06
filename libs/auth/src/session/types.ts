/** Receives `RelaySession.logout()`'s `?logout=1` flag on the next document load (`logoutStorageSweep.ts`). */
export interface ILogoutStorageSweeper {
    /** No-op unless the current URL carries `?logout=1`. Safe to call on every boot. */
    sweep(): void;
}
