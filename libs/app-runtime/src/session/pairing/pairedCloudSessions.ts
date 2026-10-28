import { logger } from '@chatic/bridges';

import { alignSessionSite } from '../../socket/auth/alignSessionSite';
import { credentialRenewers } from '../../socket/auth/renewers';
import { reauthenticateActiveSocket } from '../../socket/auth/reauthenticateActiveSocket';
import { createReauthDelegate } from '../../socket/auth/reauthDelegate';
import { getSocketManager } from '../../socket/runtime';
import { slotKeyOf } from '../../socket/utils/slotKey';
import { isExchangeInFlight, issueCloudTokens, reissueCloudTokens } from '../auth/cloudTokens';
import { cloudStore } from '../store/stores';
import { pairedClouds } from './pairedClouds';
import { pairingErrorReason, pairingErrorStatus } from './pairingRequestFlow';

/** How often a paired cloud is re-checked while the app runs. */
export const PAIRED_CLOUD_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export type PairedCloudCheck = 'kept' | 'ended' | 'unknown';

/**
 * Whether the relay refused a cloud because a pairing behind it has ended: a 403 whose reason names the
 * pairing or its approver (`pairing revoked`, `pairing not found`, `approver session revoked`,
 * `approver banned`, …) — every refusal the relay's delegation gives once an approval no longer holds.
 *
 * Only those. A 403 for any other reason — notably a request signed with relay credentials that went
 * stale while the app was closed, which the relay refuses the same way — says nothing about the
 * approval, and treating it as an ended one would sign a device out for nothing.
 *
 * It does not look at the paired clouds: the relay ties an ended pairing to the auth session that
 * claimed it and refuses that session's way into the cloud even through an invite of its own, so the
 * refusal can come on a cloud that is not a paired one.
 */
export const isRefusedForEndedPairing = (error: unknown): boolean =>
    pairingErrorStatus(error) === 403 && /\b(pairing|approver)\b/.test(pairingErrorReason(error));

/** What the lifecycle works with. Injected so each rule can be exercised against fakes. */
export interface PairedCloudSessionsDeps {
    /** The stored list of paired clouds (`chatic-paired-cloud-ids`). */
    clouds: Pick<typeof pairedClouds, 'list' | 'has' | 'add' | 'remove'>;
    /** Forgets the uid recorded for a cloud (`cloudStore.dropCloudIdentity`). */
    dropIdentity(cloudId: string): void;
    /** Re-issues a cloud's tokens through the relay's delegation; resolves with the place it landed on. */
    reissue(cloudId: string): Promise<{ landedSiteId?: string }>;
    /** Lets an exchange for the cloud already on the wire finish, whatever it answers. */
    settleExchangeInFlight(cloudId: string): Promise<void>;
    /** Moves the socket serving the cloud, if any, onto the store's tokens. May throw. */
    reauthenticate(cloudId: string): Promise<void>;
    /** Brings the committed cloud back to the selected place after a token landed it on another. */
    alignSite(cloudId: string, landedSiteId: string | undefined): Promise<void>;
    /** The teardown of a cloud whose credential ended: cached tokens dropped, stores cleared if committed. */
    tearDown(cloudId: string): void;
}

/**
 * The life of a cloud this guest entered through a pairing: entering it as the approver, re-checking it
 * through the relay, and ending it once the relay stops delegating it.
 *
 * One invariant ties the steps together and is kept here, in one place: **a paired cloud that ends
 * leaves the list and takes the uid recorded for it along.** That uid is the approver's — entering by
 * delegation records whoever the relay answered for — and the identity map outlives tokens on purpose,
 * so left behind it would go on partitioning that cloud's cache under the approver. A tab with a
 * membership of its own in the cloud (an invite) records its own uid again the next time it enters.
 *
 * Telling the app (and signing the device out) is the caller's half: `checkAll` returns the clouds
 * that ended, `forgetRefused` says whether it ended one.
 */
export class PairedCloudSessions {
    constructor(private readonly deps: PairedCloudSessionsDeps) {}

    list(): string[] {
        return this.deps.clouds.list();
    }

    has(cloudId: string): boolean {
        return this.deps.clouds.has(cloudId);
    }

    /** The cloud is over: off the list, and the approver's uid recorded there forgotten. */
    end(cloudId: string): void {
        this.deps.clouds.remove(cloudId);
        this.deps.dropIdentity(cloudId);
    }

    /**
     * Ends a paired cloud whose delegation the relay refused over an ended pairing — the approval was
     * revoked, or the approver signed out — so the switch sheet stops offering it. Anything else (the
     * network, a server hiccup, another 403) leaves it for the next try. Returns whether it ended.
     */
    forgetRefused(cloudId: string, error: unknown): boolean {
        if (!this.has(cloudId) || !isRefusedForEndedPairing(error)) return false;
        this.end(cloudId);
        return true;
    }

    /**
     * Re-issues a paired cloud's tokens through the relay's delegation and carries the session along, the
     * way a credential renewal does: the socket serving the cloud re-registers with the new tokens, and
     * the committed cloud is brought back to the selected place if the re-issue landed it on another one.
     *
     * Not `renewCloudSession`, which never throws: a paired cloud needs the 403 to know it ended. Throws
     * only when the re-issue does; the socket half never fails it.
     */
    async reissue(cloudId: string): Promise<void> {
        const { landedSiteId } = await this.deps.reissue(cloudId);
        try {
            await this.deps.reauthenticate(cloudId);
        } catch (error) {
            // The store and cache already hold the new tokens; the socket registers from them on its next
            // handshake.
            logger.warn('SOCKET', '[pairedCloudSessions] socket re-registration failed', { error, data: { cloudId } });
        }
        await this.deps.alignSite(cloudId, landedSiteId);
    }

    /**
     * Enters a cloud a pairing approved, as the account that approved it, and remembers it.
     *
     * The relay's delegation answers for the approver, so that is who this browser is in the cloud. A
     * switch, though, replays the tokens this tab already holds for the cloud when it has any — and a tab
     * that joined the same cloud on an invite of its own holds them under its own uid. Entered that way it
     * stayed itself until the next re-issue swapped it for the approver mid-session, with nothing on
     * screen to say so. So the tokens are re-issued first; the switch then finds the approval's tokens in
     * the cache.
     *
     * An exchange for the cloud already on the wire (a renewal) began before the approval and answers for
     * whoever this tab was then, and a re-issue would join it rather than start its own. It is let finish
     * first.
     *
     * Throws when the re-issue or the switch does, so the code screen can say the approval was lost.
     */
    async enter(cloudId: string, switchCloud: (cloudId: string) => Promise<unknown>): Promise<void> {
        await this.deps.settleExchangeInFlight(cloudId);
        await this.reissue(cloudId);
        await switchCloud(cloudId);
        this.deps.clouds.add(cloudId);
    }

    /**
     * Re-checks one paired cloud by re-issuing its tokens through the relay's delegation.
     *
     * A cloud server knows nothing of the relay's pairings, so a cloud session can outlive a revoked
     * approval for as long as it keeps renewing itself. The relay's delegation is what does know: once the
     * approval is revoked, or the approver signed out, it refuses (`isRefusedForEndedPairing`). That
     * refusal ends the cloud here — the teardown a cloud whose credential terminally expired gets, then
     * `end`. Anything else changes nothing; the next round tries again.
     */
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

    /** Checks every paired cloud; returns the ones that ended. */
    async checkAll(): Promise<string[]> {
        const ids = this.list();
        const results = await Promise.all(ids.map(async id => [id, await this.check(id)] as const));
        return results.filter(([, result]) => result === 'ended').map(([id]) => id);
    }
}

/** The runtime's paired clouds, wired to the real stores, token exchange and sockets. */
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

/** `pairedCloudSessions.forgetRefused`, as the session barrel publishes it. */
export const forgetRefusedPairedCloud = (cloudId: string, error: unknown): boolean =>
    pairedCloudSessions.forgetRefused(cloudId, error);
