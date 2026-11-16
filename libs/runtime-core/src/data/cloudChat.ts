import { RELAY_CLOUD_ID } from '@chatic/data';
import type { ChatSendPayload, DataRepositories, DomainChat } from '@chatic/data';

import { backgroundClouds, getSocketManager, slotKeyOf } from '@chatic/transport';
import { getDataManager } from './runtime';

/**
 * Writes addressed to a named cloud, whichever cloud the app is showing when they land.
 *
 * The app graph (`useRuntimeRepositories`) resolves its cache partition when a call starts and its
 * socket when the request goes out, and both follow the selection. A chat send spans an optimistic
 * cache write in between, so a switch landing in that gap put the row in one cloud and sent the
 * message to another. These entry points name the cloud once, up front, and everything the write does
 * — partition, uid, socket — is that cloud's.
 */

/** A missing cloud id is the relay, the same normalisation the selected context applies. */
const cloudOf = (cid: string | null | undefined): string => cid || RELAY_CLOUD_ID;

/**
 * The repository graph bound to `cid`: its partition, the uid the account has there, and its socket
 * slot. The local data sources are the app graph's own, so a write here wakes the screen observing
 * that partition. A socket call through it throws at once if `cid` has no slot bound.
 */
export const getCloudRepositories = (cid: string): DataRepositories =>
    getDataManager().getScopedRepositories(cloudOf(cid));

/**
 * Holds `cid`'s socket slot until the returned function is called, so moving to another cloud meanwhile
 * cannot tear down the socket a write is waiting on. For a write that spans several requests with work
 * of the caller's own between them — an image send asks for upload targets, uploads the bytes itself,
 * then completes and sends — the hold covers all of it. Holds stack: the slot stays until the last one
 * is released, and releasing the same hold twice releases it once.
 *
 * It keeps a slot that is bound; it does not open one. At the moment the user acts, the cloud on
 * screen has a slot, so a cloud without one means the session is not ready, and the write's first
 * socket call fails at once.
 *
 * The hold is a value rather than a callback so it can cross to a runtime in another process: there it
 * is a subscription that stands until the page ends it, or until the page itself goes away.
 */
export const holdCloud = (cid: string): (() => void) => backgroundClouds.hold(cloudOf(cid));

/**
 * Runs `work` against `cid`'s repository graph inside `holdCloud(cid)`. The hold is taken before
 * anything awaits, so it is in place before any switch the caller races with commits, and released
 * when `work` settles, success or failure. For work that runs entirely in this process — a function
 * cannot cross to a runtime in another one, so a page reaches the hold through `holdCloud` instead.
 */
export const runInCloud = async <T>(cid: string, work: (repositories: DataRepositories) => Promise<T>): Promise<T> => {
    const release = holdCloud(cid);
    try {
        return await work(getCloudRepositories(cid));
    } finally {
        release();
    }
};

/** How long a write waits for its cloud's socket to come back before it goes out regardless. */
export const CLOUD_SOCKET_WAIT_MS = 10_000;

/**
 * Resolves once `cid`'s socket is connected and signed in again, or after `timeoutMs`; never rejects.
 *
 * For a write that starts the moment the app comes back to the front. Behind an OS picker or the
 * home screen the page's socket closes; it reconnects within a second of coming back, but a send
 * started by the picker's answer would otherwise go out in that second and fail at once. Waiting
 * costs nothing when the socket is already up, and a socket that does not come back in time still
 * fails the write as before, where the row can be retried.
 */
export const waitForCloudSocket = (cid: string, timeoutMs: number = CLOUD_SOCKET_WAIT_MS): Promise<boolean> =>
    getSocketManager().waitUntilSlotVerified(slotKeyOf(cloudOf(cid)), timeoutMs);

/**
 * Sends a chat to `cid` — the cloud the user was in when they pressed send — holding that cloud's
 * slot until the ack (see `runInCloud`). Failure behaves like the app graph's `sendChat`: the
 * optimistic row stays in `cid`'s partition marked failed, and the error is rethrown.
 */
export const sendChatInCloud = (cid: string, payload: ChatSendPayload): Promise<DomainChat> =>
    runInCloud(cid, repositories => repositories.chat.sendChat(payload));
