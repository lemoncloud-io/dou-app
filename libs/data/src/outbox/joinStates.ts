import type { DomainJoin } from '../domain';
import type { DataRepositories } from '../repositories';
import type { StateSpec } from './ports';

/** The server's answer is my join row as it now stands; record it like any join the server sends. */
const recordAnswer = (repositories: DataRepositories, _write: unknown, answer: unknown): Promise<void> =>
    repositories.join.cacheWrite(answer as DomainJoin);

/**
 * My read cursor in one room. A cursor only moves forward, so a waiting read folds to the higher
 * `chatNo`, a read at or below what the server accepted is already there, and a refusal has nothing
 * to put back — the cache never takes an older cursor anyway.
 */
export const joinReadState: StateSpec<number> = {
    op: 'join.read',
    merge: (waiting, next) => Math.max(waiting, next),
    isCovered: (accepted, next) => next <= accepted,
    deliver: (repositories, write) => repositories.join.sendRead({ channelId: write.key, chatNo: write.value }),
    accept: recordAnswer,
};

type NotifyMode = DomainJoin['notify'];

/** My notification setting for one room. The latest choice wins; a refusal puts the last accepted one back. */
export const joinNotifyState: StateSpec<NotifyMode> = {
    op: 'join.notify',
    isCovered: (accepted, next) => accepted === next,
    deliver: (repositories, write) => repositories.join.sendJoinUpdate(write.key, { notify: write.value }),
    accept: recordAnswer,
    restore: (repositories, write, value) => repositories.join.writeMyJoinLocally(write.key, { notify: value }),
};

/** The name I gave one room, shown only to me. Same rules as the notification setting. */
export const joinNickState: StateSpec<string> = {
    op: 'join.nick',
    isCovered: (accepted, next) => accepted === next,
    deliver: (repositories, write) => repositories.join.sendJoinUpdate(write.key, { nick: write.value }),
    accept: recordAnswer,
    restore: (repositories, write, value) => repositories.join.writeMyJoinLocally(write.key, { nick: value }),
};

/** Every state the outbox carries today. */
export const STATE_SPECS = {
    'join.read': joinReadState,
    'join.notify': joinNotifyState,
    'join.nick': joinNickState,
} as const;
