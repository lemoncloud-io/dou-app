import { logger } from '@chatic/logger';

import { alignSessionSite } from '../socket/alignSessionSite';
import { credentialRenewers } from '../socket/renewers';
import { reauthenticateActiveSocket } from '../socket/reauthenticateActiveSocket';
import { createReauthDelegate } from '../socket/reauthDelegate';
import { getSocketManager, slotKeyOf } from '@chatic/transport';
import { isExchangeInFlight, issueCloudTokens, reissueCloudTokens } from '../session/cloudTokens';
import { cloudStore } from '@chatic/session';
import { pairedClouds } from './pairedClouds';
import { isRelayGuest } from './pairedSession';
import { pairingErrorReason, pairingErrorStatus } from './pairingRequestFlow';

export const PAIRED_CLOUD_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export type PairedCloudCheck = 'kept' | 'ended' | 'unknown';

export const isRefusedForEndedPairing = (error: unknown): boolean =>
    pairingErrorStatus(error) === 403 && /\b(pairing|approver)\b/.test(pairingErrorReason(error));

export interface PairedCloudSessionsDeps {
    clouds: Pick<typeof pairedClouds, 'list' | 'has' | 'add' | 'remove'>;
    dropIdentity(cloudId: string): void;
    reissue(cloudId: string): Promise<{ landedSiteId?: string }>;
    settleExchangeInFlight(cloudId: string): Promise<void>;
    reauthenticate(cloudId: string): Promise<void>;
    alignSite(cloudId: string, landedSiteId: string | undefined): Promise<void>;
    tearDown(cloudId: string): void;
}

export class PairedCloudSessions {
    constructor(private readonly deps: PairedCloudSessionsDeps) {}

    list(): string[] {
        return this.deps.clouds.list();
    }

    has(cloudId: string): boolean {
        return this.deps.clouds.has(cloudId);
    }

    end(cloudId: string): void {
        this.deps.clouds.remove(cloudId);
        this.deps.dropIdentity(cloudId);
    }

    async reissue(cloudId: string): Promise<void> {
        const { landedSiteId } = await this.deps.reissue(cloudId);
        try {
            await this.deps.reauthenticate(cloudId);
        } catch (error) {
            logger.warn('SOCKET', '[pairedCloudSessions] socket re-registration failed', { error, data: { cloudId } });
        }
        await this.deps.alignSite(cloudId, landedSiteId);
    }

    async prepareEntry(cloudId: string): Promise<void> {
        await this.deps.settleExchangeInFlight(cloudId);
        this.deps.dropIdentity(cloudId);
        await this.reissue(cloudId);
        this.deps.clouds.add(cloudId);
    }

    async check(cloudId: string): Promise<PairedCloudCheck> {
        try {
            await this.reissue(cloudId);
        } catch (error) {
            if (!isRefusedForEndedPairing(error)) return 'unknown';
            logger.info('SESSION', '[pairedCloudSessions] the relay no longer delegates this paired cloud', {
                data: { cloudId },
            });
            this.deps.tearDown(cloudId);
            this.end(cloudId);
            return 'ended';
        }
        return 'kept';
    }

    async checkAll(): Promise<string[]> {
        const ids = this.list();
        const results = await Promise.all(ids.map(async id => [id, await this.check(id)] as const));
        return results.filter(([, result]) => result === 'ended').map(([id]) => id);
    }
}

export const pairedCloudSessions = new PairedCloudSessions({
    clouds: pairedClouds,
    dropIdentity: cloudId => cloudStore.dropCloudIdentity(cloudId),
    reissue: async cloudId => ({ landedSiteId: (await reissueCloudTokens(cloudId)).cloudToken.$site?.id }),
    settleExchangeInFlight: async cloudId => {
        if (!isExchangeInFlight(cloudId)) return;
        await issueCloudTokens(cloudId, { allowCache: false }).catch(() => undefined);
    },
    reauthenticate: async cloudId => {
        await reauthenticateActiveSocket({
            manager: getSocketManager(),
            delegate: createReauthDelegate(),
            slot: slotKeyOf(cloudId),
        });
    },
    alignSite: (cloudId, landedSiteId) => alignSessionSite(cloudId, landedSiteId),
    tearDown: cloudId => credentialRenewers.forSlot(slotKeyOf(cloudId)).onTerminalExpiry(),
});

export const checkPairedClouds = async (): Promise<string[]> => {
    if (pairedCloudSessions.list().length === 0) return [];
    if (!isRelayGuest()) {
        pairedCloudSessions.list().forEach(cloudId => pairedCloudSessions.end(cloudId));
        return [];
    }
    return pairedCloudSessions.checkAll();
};

export const endPairedCloud = (cloudId: string): boolean => {
    if (!pairedCloudSessions.has(cloudId)) return false;
    pairedCloudSessions.end(cloudId);
    return true;
};
