import { logger } from '@chatic/logger';
import { DELEGATOR_ID_KEY, SECRET_LOGOUT_PENDING_KEY, SESSION_KEYS, type SessionKey } from '@chatic/session';

import type { KeyValueStore, NativeStore } from '@chatic/storage';
import { dropLemonLeftovers } from './lemonLeftovers.util';

import type { ISecretStorageMigration, SecretStorageBoot, SecretStorageOutcome } from './types';

const RELAY_TOKEN_KEY: SessionKey = 'chatic-relay-token';

class SecretStorageMigration implements ISecretStorageMigration {
    async prepare({ vault, plain, web, tab, afterLogout }: SecretStorageBoot): Promise<SecretStorageOutcome> {
        if (afterLogout || plain.get(SECRET_LOGOUT_PENDING_KEY) !== null) {
            vault.clear();
            const emptied = await vault.flush().then(
                () => true,
                () => false
            );
            await vault.hydrate();
            this.dropWebCopy(web);
            this.dropTabCopy(tab);
            if (emptied) plain.remove(SECRET_LOGOUT_PENDING_KEY);
            else plain.set(SECRET_LOGOUT_PENDING_KEY, '1');
            return 'logout-finished';
        }

        const read = await vault.hydrate();
        const webCopy = this.webCopy(web);

        if (read.status === 'unavailable') {
            logger.warn('SESSION', '[secretStorage] the vault is unavailable this run', { reason: read.reason });
            if (webCopy.length === 0) return 'unavailable';
            webCopy.forEach(([key, value]) => vault.set(key, value));
            return 'unavailable-with-web-copy';
        }

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
            logger.warn('SESSION', '[secretStorage] the vault did not confirm the move; the web copy stays');
            return 'migration-refused';
        }
        this.dropWebCopy(web);
        this.copyDelegatorId(vault, plain);
        return 'migrated';
    }

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

    private copyDelegatorId(vault: NativeStore, plain: KeyValueStore): void {
        const inPlain = plain.get(DELEGATOR_ID_KEY);
        const inVault = vault.get(DELEGATOR_ID_KEY);
        if (!inPlain) return;
        if (inVault) {
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

    private dropTabCopy(tab: KeyValueStore): void {
        [...SESSION_KEYS.secret, DELEGATOR_ID_KEY].forEach(key => tab.remove(key));
    }

    private dropWebCopy(web: KeyValueStore): void {
        SESSION_KEYS.secret.forEach(key => web.remove(key));
        dropLemonLeftovers(web);
    }
}

export const secretStorageMigration: ISecretStorageMigration = new SecretStorageMigration();
