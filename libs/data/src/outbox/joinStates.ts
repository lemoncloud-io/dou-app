import type { DomainJoin } from '../domain';
import type { DataRepositories } from '../repositories';
import type { StateSpec } from './ports';

/**
 * The server's answer is my whole join row, but only the field this state set is recorded: the read
 * cursor, the notification setting and my name for the room share that row, and another of them may
 * still be waiting to go out — the answer's older copy of it would put the screen back.
 */
const recordFields =
    (pick: (answer: DomainJoin) => Partial<DomainJoin>) =>
    (repositories: DataRepositories, _write: unknown, answer: unknown): Promise<void> => {
        const row = answer as DomainJoin;
        return repositories.join.cacheWrite({ id: row.id, channelId: row.channelId, userId: row.userId, ...pick(row) });
    };

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
    accept: recordFields(row => ({ readNo: row.readNo, chatNo: row.chatNo, metaNo: row.metaNo })),
};

type NotifyMode = DomainJoin['notify'];

/**
 * My notification setting for one room. The latest choice wins, and every choice is sent: another
 * device can change the setting, so "this outbox already sent that value" says nothing about the
 * server now. A refusal puts the last accepted one back.
 */
export const joinNotifyState: StateSpec<NotifyMode> = {
    op: 'join.notify',
    deliver: (repositories, write) => repositories.join.sendJoinUpdate(write.key, { notify: write.value }),
    accept: recordFields(row => ({ notify: row.notify })),
    restore: (repositories, write, value) => repositories.join.writeMyJoinLocally(write.key, { notify: value }),
};

/** The name I gave one room, shown only to me. Same rules as the notification setting. */
export const joinNickState: StateSpec<string> = {
    op: 'join.nick',
    deliver: (repositories, write) => repositories.join.sendJoinUpdate(write.key, { nick: write.value }),
    accept: recordFields(row => ({ nick: row.nick })),
    restore: (repositories, write, value) => repositories.join.writeMyJoinLocally(write.key, { nick: value }),
};

/** Every state the outbox carries today. */
export const STATE_SPECS = {
    'join.read': joinReadState,
    'join.notify': joinNotifyState,
    'join.nick': joinNickState,
} as const;
