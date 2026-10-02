import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DataRepositories, DomainChat } from '@chatic/data';

import { backgroundClouds } from '../socket/backgroundClouds';
import { getSocketManager } from '../socket/runtime';
import { slotKeyOf } from '../socket/utils/slotKey';
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
 * Runs `work` against `cid`'s repository graph while holding that cloud's socket slot, so moving to
 * another cloud meanwhile cannot tear down the socket the work is waiting on. For a write that spans
 * several requests — an image send writes its row, uploads, then sends — the hold covers all of them.
 * The hold is taken before anything awaits, so it is in place before any switch the caller races
 * with commits, and released when `work` settles, success or failure.
 *
 * It keeps a slot that is bound; it does not open one. At the moment the user acts, the cloud on
 * screen has a slot, so a cloud without one means the session is not ready, and the work's first
 * socket call fails at once.
 */
export const runInCloud = async <T>(cid: string, work: (repositories: DataRepositories) => Promise<T>): Promise<T> => {
    const cloud = cloudOf(cid);
    const release = backgroundClouds.hold(cloud);
    try {
        return await work(getCloudRepositories(cloud));
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
export const sendChatInCloud = (cid: string, payload: ChatSendInput): Promise<DomainChat> =>
    runInCloud(cid, repositories => repositories.chat.sendChat(payload));
