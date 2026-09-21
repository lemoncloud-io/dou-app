/**
 * Channels the server has refused to sync, so a screen can say why instead of waiting.
 *
 * **The problem this exists for.** Opening a room the device has never cached leaves the screen with
 * nothing to show and no way to tell "you are not in this" from "it did not load": the channel row
 * simply never arrives, and `useChannel` can only wait out a bounded timeout and then call it an
 * error. The server, meanwhile, has already answered precisely —
 * `403 FORBIDDEN - not a member of channel` — on the first poll. That verdict was consumed by the
 * scheduler and logged, and nothing downstream could read it.
 *
 * The scheduler already separates the two cases: a failure it classifies as `gone` is one the server
 * answered 403/404, and `transient` is everything else (no socket, timeout, a 5xx). This module is
 * the memory of the `gone` ones, keyed by channel id.
 *
 * **Refusal is remembered, not derived.** The membership that produced it can change — a re-invite
 * makes the same room readable again — so a successful sync of the same channel clears the entry,
 * and so does a context change. Nothing here persists beyond the session; it is a fact about what
 * this socket was told, not a stored permission.
 */

import { logger } from '@chatic/bridges';

/** Channel ids the server refused, newest write wins. */
const refused = new Set<string>();

type Listener = () => void;
const listeners = new Set<Listener>();

const notify = (): void => listeners.forEach(listener => listener());

/**
 * Records that the server refused to sync this channel.
 *
 * Called from the channel plan's failure policy on the FIRST refusal rather than from `onStopped`,
 * which the scheduler only reaches after the second consecutive one — a poll interval later, by
 * which time the screen has already spent its patience.
 */
export const recordRefusedChannel = (channelId: string): void => {
    if (refused.has(channelId)) return;
    refused.add(channelId);
    // One line per channel, not per poll: the early return above makes this the transition, and the
    // transition is what a reader wants to see next to the screen that acted on it.
    logger.info('SYNC', '[refusedChannels] the server refused this channel — the room can say so', {
        data: { channelId },
    });
    notify();
};

/**
 * Forgets a refusal, because the channel answered.
 *
 * The same room can become readable again without anything here being asked: accepting a re-invite
 * restores the join. Clearing on a successful view is what keeps a stale refusal from outliving the
 * membership that caused it.
 */
export const clearRefusedChannel = (channelId: string): void => {
    if (!refused.delete(channelId)) return;
    notify();
};

/** Drops every refusal — an account or cloud change makes all of them meaningless. */
export const clearRefusedChannels = (): void => {
    if (refused.size === 0) return;
    refused.clear();
    notify();
};

/** Whether the server has refused to sync this channel in this session. */
export const isChannelRefused = (channelId: string): boolean => refused.has(channelId);

/** Subscribes to refusal changes; returns the unsubscribe. */
export const subscribeRefusedChannels = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
