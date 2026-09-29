import { logger } from '@chatic/bridges';

import { getDataManager } from '../../data/runtime';
import { getUidInCloud } from '../../session/store';
import { unrefTimer } from '../../utils/unrefTimer';
import type { ISocketManager, SlotKey } from '../types';
import {
    BACKGROUND_PLACE_REFRESH_MS,
    BACKGROUND_RECEIVE_DEBOUNCE_MS,
    BACKGROUND_RECEIVE_INTERVAL_MS,
} from './constants';
import type { BackgroundReceiveRepositories, BackgroundReceiverDeps, BackgroundReceiveTrigger } from './types';

/** The push that says a cloud has something new. The payload is the message itself; only its arrival matters here. */
const CHAT_PUSH_TYPE = 'chat.sync';

/** One bound slot's loop. It exists for as long as the slot is bound, and receives only while the slot is not active. */
interface ReceiveLoop {
    key: SlotKey;
    receiving: boolean;
    verified: boolean;
    timer: ReturnType<typeof setInterval> | null;
    debounce: ReturnType<typeof setTimeout> | null;
    /** The run in flight, if any. A trigger that lands meanwhile sets `again` instead of starting a second one. */
    running: Promise<void> | null;
    again: boolean;
    /** When the last delta was answered — 0 until one is. */
    receivedAt: number;
    placeRefreshedAt: number;
    failing: boolean;
    unsubscribes: Array<() => void>;
}

/**
 * Keeps the lists of every cloud the user is not looking at current: its rooms, their last messages,
 * and the read positions unread counts are computed from.
 *
 * Every bound slot that is not the active one gets a loop — the background clouds, and the relay
 * while a cloud is on screen. A loop does one thing: it asks its own server for `channel.sync` since
 * its cursor, through that cloud's scoped repository graph, so the rows and the cursor land in that
 * cloud's partition. The active slot has no loop running: the app's own background sync and the
 * screens' targets already keep it current, and they read the same cursor (`channel-sync:<cid>` in
 * the cloud's own partition) — so a cloud entered from the background continues from where its loop
 * stopped instead of pulling its list again.
 *
 * Per-room chat bodies are not received here. A room is read when it is opened, and opening it makes
 * its cloud the active one.
 */
export class BackgroundReceiver {
    private readonly loops = new Map<SlotKey, ReceiveLoop>();
    private readonly getRepositories: (cid: string) => BackgroundReceiveRepositories;
    private readonly getUid: (cid: string) => string | null;
    private readonly now: () => number;
    private readonly intervalMs: number;
    private readonly debounceMs: number;
    private readonly placeRefreshMs: number;
    private readonly unsubscribeSlots: () => void;
    private readonly unsubscribeActive: () => void;
    private destroyed = false;

    constructor(
        private readonly manager: ISocketManager,
        deps: BackgroundReceiverDeps = {}
    ) {
        this.getRepositories = deps.getRepositories ?? (cid => getDataManager().getScopedRepositories(cid));
        this.getUid = deps.getUid ?? getUidInCloud;
        this.now = deps.now ?? Date.now;
        this.intervalMs = deps.intervalMs ?? BACKGROUND_RECEIVE_INTERVAL_MS;
        this.debounceMs = deps.debounceMs ?? BACKGROUND_RECEIVE_DEBOUNCE_MS;
        this.placeRefreshMs = deps.placeRefreshMs ?? BACKGROUND_PLACE_REFRESH_MS;

        // A slot is announced before the active pointer moves onto it, so a loop exists by the time
        // the active notification below pauses it.
        this.unsubscribeSlots = this.manager.subscribeSlotClients((key, client) => {
            if (client) this.attach(key);
            else this.detach(key);
        });
        this.unsubscribeActive = this.manager.subscribeClient(() => this.reconcileActive());
    }

    /**
     * Asks every background cloud whose socket is verified for its delta now — for the app's
     * foreground return, when timers were frozen and pushes may have been missed.
     */
    public receiveNow(): void {
        for (const loop of this.loops.values()) {
            if (loop.receiving && loop.verified) this.request(loop, 'foreground');
        }
    }

    public destroy(): void {
        this.destroyed = true;
        this.unsubscribeSlots();
        this.unsubscribeActive();
        for (const key of [...this.loops.keys()]) this.detach(key);
    }

    private attach(key: SlotKey): void {
        // A new client for a key is a new connection, and the manager announces the old one's
        // teardown first — so this replaces a loop only if that announcement never came.
        this.detach(key);
        const loop: ReceiveLoop = {
            key,
            receiving: false,
            verified: false,
            timer: null,
            debounce: null,
            running: null,
            again: false,
            receivedAt: 0,
            placeRefreshedAt: 0,
            failing: false,
            unsubscribes: [],
        };
        this.loops.set(key, loop);
        loop.unsubscribes.push(
            this.manager.subscribeSlotVerified(key, verified => {
                const rose = verified && !loop.verified;
                loop.verified = verified;
                if (rose && loop.receiving) this.request(loop, 'verified');
            }),
            this.manager.onSlotType(key, CHAT_PUSH_TYPE, () => this.onPush(loop))
        );
        this.setReceiving(loop, !this.isActive(key));
    }

    private detach(key: SlotKey): void {
        const loop = this.loops.get(key);
        if (!loop) return;
        this.setReceiving(loop, false);
        for (const unsubscribe of loop.unsubscribes) unsubscribe();
        this.loops.delete(key);
    }

    /**
     * Whether `loop` is still the one for its slot. A run outlives its loop when the slot is rebuilt
     * or torn down mid-request; past that point it must not ask again — its next request would go out
     * on the new connection beside the new loop's own — nor move the cursor.
     */
    private isLive(loop: ReceiveLoop): boolean {
        return !this.destroyed && this.loops.get(loop.key) === loop;
    }

    private reconcileActive(): void {
        for (const loop of this.loops.values()) this.setReceiving(loop, !this.isActive(loop.key));
    }

    private isActive(key: SlotKey): boolean {
        return this.manager.getBoundCid() === key;
    }

    private setReceiving(loop: ReceiveLoop, receiving: boolean): void {
        if (loop.receiving === receiving) return;
        loop.receiving = receiving;
        if (!receiving) {
            // A run already in flight finishes: it writes into its own cloud's partition, which is
            // the partition the app's sync now reads too, so there is nothing to protect by cutting it.
            if (loop.timer) clearInterval(loop.timer);
            if (loop.debounce) clearTimeout(loop.debounce);
            loop.timer = null;
            loop.debounce = null;
            loop.again = false;
            // From here the app keeps this cloud current, so when the user leaves it again the clock
            // starts from now: its list and places are as fresh as the app's last delta left them.
            const now = this.now();
            loop.receivedAt = now;
            loop.placeRefreshedAt = now;
            return;
        }
        loop.timer = setInterval(() => {
            if (loop.verified) this.request(loop, 'interval');
        }, this.intervalMs);
        unrefTimer(loop.timer);
        // A cloud that just left the screen was kept current by the app until now (see above), so it
        // waits for its tick. One never on screen since its slot bound — the relay a cloud boots over,
        // say — has not been asked for a full interval and asks soon instead. Soon, not now: the binder moves the pointer off a cloud and tears down
        // a slot it does not keep in one pass, and a request sent in between would go out on a socket
        // that is closing. The teardown clears the timer.
        if (loop.verified && this.now() - loop.receivedAt >= this.intervalMs) this.schedule(loop, 'resume');
    }

    private onPush(loop: ReceiveLoop): void {
        if (!loop.receiving) return;
        logger.debug('SYNC', '[BackgroundReceiver] push on a background cloud', { data: { cid: loop.key } });
        this.schedule(loop, 'push');
    }

    /** Asks after the debounce, restarting it — a burst of triggers is one request. */
    private schedule(loop: ReceiveLoop, trigger: BackgroundReceiveTrigger): void {
        if (loop.debounce) clearTimeout(loop.debounce);
        loop.debounce = setTimeout(() => {
            loop.debounce = null;
            this.request(loop, trigger);
        }, this.debounceMs);
        unrefTimer(loop.debounce);
    }

    /** Starts a run, or — when one is in flight — asks it to go once more when it is done. */
    private request(loop: ReceiveLoop, trigger: BackgroundReceiveTrigger): void {
        if (loop.running) {
            loop.again = true;
            return;
        }
        loop.running = (async () => {
            let next: BackgroundReceiveTrigger | null = trigger;
            while (next) {
                loop.again = false;
                await this.receive(loop, next);
                next = loop.again && loop.receiving && this.isLive(loop) ? trigger : null;
            }
        })().finally(() => {
            loop.running = null;
        });
    }

    private async receive(loop: ReceiveLoop, trigger: BackgroundReceiveTrigger): Promise<void> {
        const cid = loop.key;
        const kind = `channel-sync:${cid}`;
        // Everything is inside the try, the synchronous lookups too: the run is fire-and-forget, so
        // a throw that escaped here would surface as an unhandled rejection instead of a warning.
        try {
            // No uid in that cloud means no partition to write into — the account's identity there
            // has not been issued yet, or was dropped.
            const uid = this.getUid(cid);
            if (!uid) return;
            const repositories = this.getRepositories(cid);
            this.refreshPlaces(loop, repositories);
            const since = await repositories.syncMeta.getSyncedAt(kind);
            if (!this.isLive(loop)) return;
            const { syncedAt, removedCount } = await repositories.channel.syncChannels(since);
            // The cursor belongs to the account that asked, and to the loop that asked. If either
            // changed while the answer was on its way, the cursor is left alone and the next run —
            // the new loop's, if it was this one's slot that went — asks again.
            if (this.isLive(loop) && this.getUid(cid) === uid) {
                await repositories.syncMeta.setSyncedAt(kind, syncedAt);
            }
            loop.receivedAt = this.now();
            if (loop.failing) {
                loop.failing = false;
                logger.info('SYNC', '[BackgroundReceiver] delta recovered', { data: { cid } });
            }
            logger.debug('SYNC', '[BackgroundReceiver] delta received', {
                data: { cid, trigger, since, syncedAt, removedCount },
            });
        } catch (error) {
            // The cursor stays put, so the next run asks from the same point. Reported once per
            // streak: at one request a minute, a cloud that is down would otherwise log forever.
            if (!loop.failing) {
                loop.failing = true;
                logger.warn('SYNC', '[BackgroundReceiver] delta failed', { error, data: { cid, trigger } });
            }
        }
    }

    /**
     * Re-reads the place list when it is due. Beside the delta, not ahead of it: the rooms do not wait
     * for their places, and a failure — thrown or rejected — is retried on the next delta.
     */
    private refreshPlaces(loop: ReceiveLoop, repositories: BackgroundReceiveRepositories): void {
        const now = this.now();
        if (now - loop.placeRefreshedAt < this.placeRefreshMs) return;
        loop.placeRefreshedAt = now;
        void Promise.resolve()
            .then(() => repositories.place.refreshList())
            .catch(error => {
                loop.placeRefreshedAt = 0;
                logger.warn('SYNC', '[BackgroundReceiver] place refresh failed', { error, data: { cid: loop.key } });
            });
    }
}
