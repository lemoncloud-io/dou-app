import { sessionStores } from '@chatic/session';

import { authPlatform } from '../../platform';
import { dropSignedOutAppKeys } from './signedOutAppKeys.util';

import type { ILogoutStorageSweeper } from './types';

/**
 * The other half of `RelaySession.logout()` — the reader of its `?logout=1` flag.
 *
 * Logout redirects to `/?logout=1` and the tab reloads, so the sign-out and the cleanup happen in
 * two different page lifetimes. The logout already cleared the session and the app keys a sign-out takes before it left; this runs the last of those once more on the new
 * document, because the log pipeline can write a batch between that clear and the navigation.
 *
 * The device vault is not this sweep's: the secret storage boot empties it on `?logout=1` before it
 * is read (`secretStorageMigration.ts`), and that has to happen before anything reads a token, which is earlier
 * than this runs.
 *
 * It used to clear the whole `@` namespace of the session's storage, keeping only the config lane and
 * the language key. That took lemon-web-core's credential bundle, which nothing writes any more,
 * and whatever else moved in under `@` later; the app's own keys are now named instead
 * (`signedOutAppKeys.util.ts`).
 *
 * **Where it runs.** From `initAppRuntime`, before any wiring that can read a token.
 */
class LogoutStorageSweeper implements ILogoutStorageSweeper {
    sweep(): void {
        // Outside the try: a platform that was never wired is a boot bug to hear about, not a storage
        // quirk to swallow.
        const search = authPlatform.ports().currentSearch();

        try {
            if (new URLSearchParams(search).get('logout') !== '1') return;
            dropSignedOutAppKeys(sessionStores.of('plain'));
        } catch {
            // Storage access throws in a few browser configurations. A missed sweep leaves a log batch
            // the next upload sends anyway — never a failed boot.
        }
    }
}

export const logoutStorageSweeper: ILogoutStorageSweeper = new LogoutStorageSweeper();
