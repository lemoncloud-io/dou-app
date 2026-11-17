import { logger } from '@chatic/logger';
import { DELEGATOR_ID_KEY, SECRET_LOGOUT_PENDING_KEY, SESSION_KEYS, type SessionKey } from '@chatic/session';

import type { KeyValueStore, NativeStore } from '@chatic/storage';
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
 * | values                | no       | the vault is the truth                                         |
 * | values                | yes      | the copy replaces the vault's tokens; delete it once confirmed |
 * | empty                 | yes      | write the copy into the vault; delete it once confirmed        |
 * | empty                 | no       | signed out                                                     |
 *
 * lemon-web-core's old bundle (`@<project>.*`) goes with the web copy: nothing writes it any more, so
 * whatever is left in web storage is an older build's and nobody's.
 *
 * The rows are decided by the four tokens alone. The device guest's id may sit in the vault as well
 * (see `copyDelegatorId`), and a vault holding only that id is not a signed-in one.
 *
 * In three rows the device guest's id is then copied into the vault from the plain store, if the vault
 * lacks it: `values` with no web copy; `empty` with no web copy; and `empty` with a web copy, once the
 * move is confirmed. Never in the logout row, the unavailable rows, or a move the vault refused. In the
 * `values` row with a web copy it is written over the vault's, with the tokens (`replaceWithWebCopy`).
 */
/**
 * The token a session cannot be without. A web copy that lacks it is a leftover, not a session, and
 * never replaces what the vault holds.
 */
const RELAY_TOKEN_KEY: SessionKey = 'chatic-relay-token';

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
            // Into the tab's storage (the store has switched to it), so this run is signed in. The web
            // copy stays for the next run that reaches the vault.
            webCopy.forEach(([key, value]) => vault.set(key, value));
            return 'unavailable-with-web-copy';
        }

        // The vault answers again: tokens an unavailable run kept in the tab are stale or the vault's.
        this.dropTabCopy(tab);

        if (read.reset) logger.warn('SESSION', '[secretStorage] the vault could not be decrypted and was emptied');

        const tokensInVault = SESSION_KEYS.secret.some(key => key in read.values);
        const webCopyIsSession = webCopy.some(([key]) => key === RELAY_TOKEN_KEY);
        if (tokensInVault && webCopyIsSession) return this.replaceWithWebCopy(vault, plain, web, webCopy);
        if (tokensInVault) {
            this.dropWebCopy(web);
            this.copyDelegatorId(vault, plain);
            return 'vault';
        }

        if (webCopy.length === 0) {
            this.copyDelegatorId(vault, plain);
            return 'empty';
        }

        webCopy.forEach(([key, value]) => vault.set(key, value));
        try {
            await vault.flush();
        } catch {
            // The store moved what it held into the tab for this run; the web copy stays for the next.
            logger.warn('SESSION', '[secretStorage] the vault did not confirm the move; the web copy stays');
            return 'migration-refused';
        }
        this.dropWebCopy(web);
        this.copyDelegatorId(vault, plain);
        return 'migrated';
    }

    /**
     * A vault holding a session while the web copy was never moved. Every boot that reads the vault
     * deletes the web copy, and nothing writes one any more, so a web copy next to vault tokens means
     * no page has ever booted on this vault: the tokens in it were written by something else. The
     * phone app's own runtime is that something. An install updating straight from an app without a
     * vault starts the runtime on an empty vault, which signs the device in as a guest while the
     * person's session is still in this origin's `localStorage`. Taking the vault as the truth here
     * would delete that session, so the web copy wins.
     *
     * The copy replaces the vault's whole token set rather than merging into it: a token the copy
     * lacks would otherwise keep belonging to the other session. The device guest's id goes with it,
     * overwriting the vault's, because the plain copy is the one the page has accepted invites under,
     * while the vault's was written by the same guest sign-in. Both go out in one write; nothing is
     * deleted until the shell confirms it.
     */
    private async replaceWithWebCopy(
        vault: NativeStore,
        plain: KeyValueStore,
        web: KeyValueStore,
        webCopy: [string, string][]
    ): Promise<SecretStorageOutcome> {
        logger.warn(
            'session.web_copy_replaced_vault',
            'the vault holds a session the page never moved; the web copy wins'
        );
        const copied = new Set(webCopy.map(([key]) => key));
        webCopy.forEach(([key, value]) => vault.set(key, value));
        SESSION_KEYS.secret.filter(key => !copied.has(key)).forEach(key => vault.remove(key));
        const guestId = plain.get(DELEGATOR_ID_KEY);
        if (guestId) vault.set(DELEGATOR_ID_KEY, guestId);
        try {
            await vault.flush();
        } catch {
            logger.warn(
                'session.web_copy_replace_refused',
                'the vault did not confirm the replacement; the web copy stays'
            );
            return 'migration-refused';
        }
        this.dropWebCopy(web);
        return 'replaced';
    }

    hasWebCopy(web: KeyValueStore): boolean {
        return this.webCopy(web).length > 0;
    }

    discardWebCopy(web: KeyValueStore): void {
        SESSION_KEYS.secret.forEach(key => web.remove(key));
    }

    /**
     * Copies the device guest's id from the plain store into a vault that lacks it. Never deletes and
     * never overwrites: the plain copy stays where an older build reads it, and a vault that already
     * holds an id keeps it.
     *
     * Before this, the id lived only in the plain store — the page's `localStorage` — where the phone
     * app's own runtime cannot read it. An install signed in to an account does not log in as a guest
     * again, the only moment the id is written, so without this copy it would never reach the vault.
     * The copy is retried on every boot until the vault holds it, which makes a failed write cost
     * nothing but the wait: the reader falls back to the plain copy meanwhile.
     *
     * So it is sent as an `offer`, not a `set`. A refused `set` switches the store to the tab for the
     * rest of the run and takes the session's tokens with it, which is too high a price for a copy.
     * The boot does not wait for it either. A vault that never answers would otherwise hold the boot
     * for the full timeout on every launch until the write lands. The offer is queued in order with
     * the writes after it, so a logout made meanwhile still wins.
     */
    private copyDelegatorId(vault: NativeStore, plain: KeyValueStore): void {
        const inPlain = plain.get(DELEGATOR_ID_KEY);
        const inVault = vault.get(DELEGATOR_ID_KEY);
        if (!inPlain) return;
        if (inVault) {
            // Both name this device's guest, so they should agree. Kept as it is either way; the
            // vault is what the reader takes first.
            if (inVault !== inPlain) {
                logger.warn('session.guest_id_copies_differ', 'the vault and the plain store name different guests');
            }
            return;
        }
        void vault.offer(DELEGATOR_ID_KEY, inPlain).then(confirmed => {
            if (confirmed) logger.info('session.guest_id_copied', 'copied the device guest id into the vault');
            else logger.warn('session.guest_id_copy_refused', 'the vault took no guest id; the next boot tries again');
        });
    }

    private webCopy(web: KeyValueStore): [string, string][] {
        return SESSION_KEYS.secret.flatMap(key => {
            const value = web.get(key);
            return value === null ? [] : [[key, value] as [string, string]];
        });
    }

    /**
     * The guest id goes too: a run whose vault was unavailable wrote it into the tab through the
     * store's fallback, and a tab copy left behind would be read ahead of the plain one by the next
     * such run. The tab is never the plain store: every caller passes the tab's own storage, or memory.
     */
    private dropTabCopy(tab: KeyValueStore): void {
        [...SESSION_KEYS.secret, DELEGATOR_ID_KEY].forEach(key => tab.remove(key));
    }

    private dropWebCopy(web: KeyValueStore): void {
        SESSION_KEYS.secret.forEach(key => web.remove(key));
        dropLemonLeftovers(web);
    }
}

export const secretStorageMigration: ISecretStorageMigration = new SecretStorageMigration();
