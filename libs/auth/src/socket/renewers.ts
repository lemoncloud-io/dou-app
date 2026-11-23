import { logger } from '@chatic/logger';

import { RELAY_CLOUD_ID } from '@chatic/data';

import { Coalescer } from '../utils/coalescer';
import { credentialFreshness, cloudStore, getCommittedCloudId } from '@chatic/session';
import { cloudSession } from '../session/cloudSession';
import { relaySession } from '../session/relaySession';
import { backgroundClouds, readOnline, kindOf, RELAY_SLOT } from '@chatic/transport';
import type { SlotKey } from '@chatic/transport';
import { getAuthStatus } from './authStatus';
import { renewCloudSession } from './renewCloudSession';
import { requestRelaySessionRefresh } from './requestRelaySessionRefresh';

export interface ICredentialRenewer {
    readonly cid: string;
    timeToExpiry(now?: number): number | null;
    renew(): Promise<boolean>;
    onTerminalExpiry(): Promise<void> | void;
}

const EXPIRY_CONFIRMATION_MS = 30_000;

const EXPIRY_CONFIRMATION_ROUNDS = 2;

const isExpiryResolved = (status: ReturnType<typeof getAuthStatus>): boolean =>
    status === 'verified' || status === 'stale' || status === 'absent';

export interface RelayExpiryDeps {
    isOnline?: () => boolean;
    readStatus?: () => ReturnType<typeof getAuthStatus>;
    wait?: (ms: number) => Promise<void>;
    logout?: () => Promise<void>;
}

const defaultIsOnline = readOnline;
const defaultWait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export class RelayCredentialRenewer implements ICredentialRenewer {
    readonly cid = RELAY_CLOUD_ID;

    private readonly confirmation = new Coalescer<void>();

    constructor(private readonly deps: RelayExpiryDeps = {}) {}

    timeToExpiry(now?: number): number | null {
        return credentialFreshness.timeToExpiry(RELAY_CLOUD_ID, now);
    }

    renew(): Promise<boolean> {
        return requestRelaySessionRefresh();
    }

    onTerminalExpiry(): Promise<void> {
        return this.confirmation.run(() => this.confirmTerminalExpiry());
    }

    private async confirmTerminalExpiry(): Promise<void> {
        const isOnline = this.deps.isOnline ?? defaultIsOnline;
        const wait = this.deps.wait ?? defaultWait;
        const readStatus = this.deps.readStatus ?? (() => getAuthStatus(RELAY_SLOT));
        const logout = this.deps.logout ?? (() => relaySession.clearAndRedirect());

        if (!isOnline()) {
            logger.warn('SOCKET', '[relayRenewer] relay auth expired while offline — not logging out');
            return;
        }

        let status: ReturnType<typeof getAuthStatus> = 'expired';

        for (let round = 1; round <= EXPIRY_CONFIRMATION_ROUNDS; round += 1) {
            await wait(EXPIRY_CONFIRMATION_MS);

            if (!isOnline()) {
                logger.warn('SOCKET', '[relayRenewer] relay auth expiry unconfirmed (went offline) — not logging out');
                return;
            }

            status = readStatus();
            if (isExpiryResolved(status)) {
                logger.info('SOCKET', '[relayRenewer] relay auth recovered within the confirmation window', {
                    data: { status, round },
                });
                return;
            }

            if (round < EXPIRY_CONFIRMATION_ROUNDS) {
                logger.info('SOCKET', '[relayRenewer] relay auth not yet recovered — waiting one more window', {
                    data: { status, round },
                });
            }
        }

        logger.warn('SOCKET', '[relayRenewer] relay auth still unrecovered after confirmation — auto-logging out', {
            data: { status, rounds: EXPIRY_CONFIRMATION_ROUNDS },
        });
        await logout();
    }
}

export class CloudCredentialRenewer implements ICredentialRenewer {
    constructor(readonly cid: string) {}

    timeToExpiry(now?: number): number | null {
        return credentialFreshness.timeToExpiry(this.cid, now);
    }

    renew(): Promise<boolean> {
        return renewCloudSession(this.cid);
    }

    onTerminalExpiry(): void {
        cloudStore.dropCachedCloudTokens(this.cid);
        if (getCommittedCloudId() === this.cid) {
            cloudSession.clearStores();
        } else {
            logger.warn('SOCKET', '[cloudRenewer] non-committed cloud auth expired — its cached tokens are dropped', {
                data: { cid: this.cid },
            });
        }
        backgroundClouds.noteExpired(this.cid);
    }
}

const relayRenewer: ICredentialRenewer = new RelayCredentialRenewer();
const cloudRenewers = new Map<string, CloudCredentialRenewer>();

export const credentialRenewers = {
    relay: relayRenewer,
    forSlot(key: SlotKey): ICredentialRenewer {
        if (kindOf(key) === 'relay') return relayRenewer;
        let renewer = cloudRenewers.get(key);
        if (!renewer) {
            renewer = new CloudCredentialRenewer(key);
            cloudRenewers.set(key, renewer);
        }
        return renewer;
    },
};
