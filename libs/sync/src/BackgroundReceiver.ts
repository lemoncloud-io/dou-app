import { logger } from '@chatic/logger';

import { syncDataGraph } from './dataGraph';
import { getUidInCloud } from '@chatic/session';
import { unrefTimer } from './unrefTimer';
import type { ISocketManager, SlotKey } from '@chatic/transport';
import { emitBackgroundDelta } from './backgroundDeltas';
import {
    BACKGROUND_PLACE_REFRESH_MS,
    BACKGROUND_RECEIVE_DEBOUNCE_MS,
    BACKGROUND_RECEIVE_INTERVAL_MS,
} from './constants';
import type {
    BackgroundDelta,
    BackgroundReceiveRepositories,
    BackgroundReceiverDeps,
    BackgroundReceiveTrigger,
} from './types';

const CHAT_PUSH_TYPE = 'chat.sync';

interface ReceiveLoop {
    key: SlotKey;
    receiving: boolean;
    verified: boolean;
    timer: ReturnType<typeof setInterval> | null;
    debounce: ReturnType<typeof setTimeout> | null;
    running: Promise<void> | null;
    again: BackgroundReceiveTrigger | null;
    scheduled: BackgroundReceiveTrigger | null;
    receivedAt: number;
    placeRefreshedAt: number;
    failing: boolean;
    unsubscribes: Array<() => void>;
}

export class BackgroundReceiver {
    private readonly loops = new Map<SlotKey, ReceiveLoop>();
    private readonly getRepositories: (cid: string) => BackgroundReceiveRepositories;
    private readonly getUid: (cid: string) => string | null;
    private readonly now: () => number;
    private readonly intervalMs: number;
    private readonly debounceMs: number;
    private readonly placeRefreshMs: number;
    private readonly onDelta: (delta: BackgroundDelta) => void;
    private readonly unsubscribeSlots: () => void;
    private readonly unsubscribeActive: () => void;
    private destroyed = false;

    constructor(
        private readonly manager: ISocketManager,
        deps: BackgroundReceiverDeps = {}
    ) {
        this.getRepositories = deps.getRepositories ?? (cid => syncDataGraph.get().getScopedRepositories(cid));
        this.getUid = deps.getUid ?? getUidInCloud;
        this.now = deps.now ?? Date.now;
        this.intervalMs = deps.intervalMs ?? BACKGROUND_RECEIVE_INTERVAL_MS;
        this.debounceMs = deps.debounceMs ?? BACKGROUND_RECEIVE_DEBOUNCE_MS;
        this.placeRefreshMs = deps.placeRefreshMs ?? BACKGROUND_PLACE_REFRESH_MS;
        this.onDelta = deps.onDelta ?? emitBackgroundDelta;

        this.unsubscribeSlots = this.manager.subscribeSlotClients((key, client) => {
            if (client) this.attach(key);
            else this.detach(key);
        });
        this.unsubscribeActive = this.manager.subscribeClient(() => this.reconcileActive());
    }

    public receiveNow(cid?: string): void {
        for (const loop of this.loops.values()) {
            if (cid !== undefined && loop.key !== cid) continue;
            if (!loop.receiving || !loop.verified) continue;
            if (cid === undefined) this.request(loop, 'foreground');
            else this.schedule(loop, 'kick');
        }
    }

    public destroy(): void {
        this.destroyed = true;
        this.unsubscribeSlots();
        this.unsubscribeActive();
        for (const key of [...this.loops.keys()]) this.detach(key);
    }

    private attach(key: SlotKey): void {
        this.detach(key);
        const loop: ReceiveLoop = {
            key,
            receiving: false,
            verified: false,
            timer: null,
            debounce: null,
            running: null,
            again: null,
            scheduled: null,
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
            if (loop.timer) clearInterval(loop.timer);
            if (loop.debounce) clearTimeout(loop.debounce);
            loop.timer = null;
            loop.debounce = null;
            loop.scheduled = null;
            loop.again = null;
            const now = this.now();
            loop.receivedAt = now;
            loop.placeRefreshedAt = now;
            return;
        }
        loop.timer = setInterval(() => {
            if (loop.verified) this.request(loop, 'interval');
        }, this.intervalMs);
        unrefTimer(loop.timer);
        if (loop.verified && this.now() - loop.receivedAt >= this.intervalMs) this.schedule(loop, 'resume');
    }

    private onPush(loop: ReceiveLoop): void {
        if (!loop.receiving) return;
        logger.debug('SYNC', '[BackgroundReceiver] push on a background cloud', { data: { cid: loop.key } });
        this.schedule(loop, 'push');
    }

    private schedule(loop: ReceiveLoop, trigger: BackgroundReceiveTrigger): void {
        if (loop.debounce) clearTimeout(loop.debounce);
        loop.scheduled = merged(loop.scheduled, trigger);
        loop.debounce = setTimeout(() => {
            const scheduled = loop.scheduled ?? trigger;
            loop.debounce = null;
            loop.scheduled = null;
            this.request(loop, scheduled);
        }, this.debounceMs);
        unrefTimer(loop.debounce);
    }

    private request(loop: ReceiveLoop, trigger: BackgroundReceiveTrigger): void {
        if (loop.running) {
            loop.again = merged(loop.again, trigger);
            return;
        }
        loop.running = (async () => {
            let next: BackgroundReceiveTrigger | null = trigger;
            while (next) {
                loop.again = null;
                await this.receive(loop, next);
                next = loop.receiving && this.isLive(loop) ? loop.again : null;
            }
        })().finally(() => {
            loop.running = null;
        });
    }

    private async receive(loop: ReceiveLoop, trigger: BackgroundReceiveTrigger): Promise<void> {
        const cid = loop.key;
        const kind = `channel-sync:${cid}`;
        const requestedAt = this.now();
        try {
            const uid = this.getUid(cid);
            if (!uid) return;
            const repositories = this.getRepositories(cid);
            const places =
                trigger === 'kick'
                    ? this.readPlaces(loop, repositories)
                    : (this.refreshPlaces(loop, repositories), null);
            const since = await repositories.syncMeta.getSyncedAt(kind);
            if (!this.isLive(loop)) return;
            const { syncedAt, removedCount } = await repositories.channel.syncChannels(since);
            if (this.isLive(loop) && this.getUid(cid) === uid) {
                await repositories.syncMeta.setSyncedAt(kind, syncedAt);
                const placesRead = places ? await places : true;
                if (placesRead && this.isLive(loop)) this.onDelta({ cid, requestedAt });
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
            if (!loop.failing) {
                loop.failing = true;
                logger.warn('SYNC', '[BackgroundReceiver] delta failed', { error, data: { cid, trigger } });
            }
        }
    }

    private refreshPlaces(loop: ReceiveLoop, repositories: BackgroundReceiveRepositories): void {
        if (this.now() - loop.placeRefreshedAt < this.placeRefreshMs) return;
        void this.readPlaces(loop, repositories);
    }

    private readPlaces(loop: ReceiveLoop, repositories: BackgroundReceiveRepositories): Promise<boolean> {
        loop.placeRefreshedAt = this.now();
        return Promise.resolve()
            .then(() => repositories.place.refreshList())
            .then(() => true)
            .catch(error => {
                loop.placeRefreshedAt = 0;
                logger.warn('SYNC', '[BackgroundReceiver] place refresh failed', { error, data: { cid: loop.key } });
                return false;
            });
    }
}

const merged = (
    pending: BackgroundReceiveTrigger | null,
    incoming: BackgroundReceiveTrigger
): BackgroundReceiveTrigger => (pending === 'kick' ? 'kick' : incoming);
