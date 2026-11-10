import { logger } from '@chatic/bridges';
import { SECRET_LOGOUT_PENDING_KEY, SESSION_KEYS } from '@chatic/session';

import type { KeyValueStore } from '@chatic/storage';
import { dropLemonLeftovers } from './lemonLeftovers.util';

import type { ISecretStorageMigration, SecretStorageBoot, SecretStorageOutcome } from './types';

/**
 * Moves an app or desktop shell's secrets from web storage into the device vault, at boot.
 *
 * The secrets — the four session tokens — used to live in the origin's `localStorage`. A shell that
 * keeps a vault now holds them there, and the web copy is deleted, but only once the shell has
 * confirmed the vault holds them: deleting first would sign the person out on a write that failed.
 * Every row of the table below is decided from what the vault answered and what web storage still
 * holds, so the move is resumable — a boot that dies half-way finds the web copy still there and does
 * it again.
 *
 * | vault answered        | web copy | what happens                                                   |
 * | --------------------- | -------- | -------------------------------------------------------------- |
 * | (logout marker set)   | any      | empty the vault, delete the web copy, drop the marker          |
 * | unavailable           | yes      | this run signs in from the copy, held in the tab; keep the copy |
 * | unavailable           | no       | this run keeps the session in the tab                          |
 * | values                | any      | the vault is the truth; delete the web copy                    |
 * | empty                 | yes      | write the copy into the vault; delete it once confirmed        |
 * | empty                 | no       | signed out                                                     |
 *
 * lemon-web-core's old bundle (`@<project>.*`) goes with the web copy: nothing writes it any more, so
 * whatever is left in web storage is an older build's and nobody's.
 */
class SecretStorageMigration implements ISecretStorageMigration {
    async prepare({ vault, plain, web, tab, afterLogout }: SecretStorageBoot): Promise<SecretStorageOutcome> {
        // A logout empties the vault before it leaves the page; this second clear is for one whose
        // confirmation never came. It goes out and is confirmed BEFORE the vault is read: a read sent
        // first would hand back the tokens the logout was clearing.
        if (afterLogout || plain.get(SECRET_LOGOUT_PENDING_KEY) !== null) {
            vault.clear();
            const emptied = await vault.flush().then(
                () => true,
                () => false
            );
            await vault.hydrate();
            this.dropWebCopy(web);
            this.dropTabCopy(tab);
            // Kept when the vault did not confirm, so the next boot tries again.
            if (emptied) plain.remove(SECRET_LOGOUT_PENDING_KEY);
            else plain.set(SECRET_LOGOUT_PENDING_KEY, '1');
            return 'logout-finished';
        }

        const read = await vault.hydrate();
        const webCopy = this.webCopy(web);

        if (read.status === 'unavailable') {
            logger.warn('SESSION', '[secretStorage] the vault is unavailable this run', { reason: read.reason });
            if (webCopy.length === 0) return 'unavailable';
            // Into the tab's storage (the medium has switched to it), so this run is signed in. The web
            // copy stays for the next run that reaches the vault.
            webCopy.forEach(([key, value]) => vault.set(key, value));
            return 'unavailable-with-web-copy';
        }

        // The vault answers again: tokens an unavailable run kept in the tab are stale or the vault's.
        this.dropTabCopy(tab);

        if (read.reset) logger.warn('SESSION', '[secretStorage] the vault could not be decrypted and was emptied');

        if (Object.keys(read.values).length > 0) {
            this.dropWebCopy(web);
            return 'vault';
        }

        if (webCopy.length === 0) return 'empty';

        webCopy.forEach(([key, value]) => vault.set(key, value));
        try {
            await vault.flush();
        } catch {
            // The medium moved what it held into the tab for this run; the web copy stays for the next.
            logger.warn('SESSION', '[secretStorage] the vault did not confirm the move; the web copy stays');
            return 'migration-refused';
        }
        this.dropWebCopy(web);
        return 'migrated';
    }

    private webCopy(web: KeyValueStore): [string, string][] {
        return SESSION_KEYS.secret.flatMap(key => {
            const value = web.get(key);
            return value === null ? [] : [[key, value] as [string, string]];
        });
    }

    private dropTabCopy(tab: KeyValueStore): void {
        SESSION_KEYS.secret.forEach(key => tab.remove(key));
    }

    private dropWebCopy(web: KeyValueStore): void {
        SESSION_KEYS.secret.forEach(key => web.remove(key));
        dropLemonLeftovers(web);
    }
}

export const secretStorageMigration: ISecretStorageMigration = new SecretStorageMigration();
