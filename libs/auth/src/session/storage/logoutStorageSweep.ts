import { sessionStores } from '@chatic/session';

import { authPlatform } from '../../platform';
import { dropSignedOutAppKeys } from './signedOutAppKeys.util';

import type { ILogoutStorageSweeper } from './types';

class LogoutStorageSweeper implements ILogoutStorageSweeper {
    sweep(): void {
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
