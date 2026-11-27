import type { StateSpec } from '@chatic/data-local';
import type { DomainJoin } from '@chatic/data-model';

import type { DataRepositories } from '..';

const recordFields =
    (pick: (answer: DomainJoin) => Partial<DomainJoin>) =>
    (repositories: DataRepositories, _write: unknown, answer: unknown): Promise<void> => {
        const row = answer as DomainJoin;
        return repositories.join.cacheWrite({ id: row.id, channelId: row.channelId, userId: row.userId, ...pick(row) });
    };

export const joinReadState: StateSpec<number, DataRepositories> = {
    op: 'join.read',
    merge: (waiting, next) => Math.max(waiting, next),
    isCovered: (accepted, next) => next <= accepted,
    deliver: (repositories, write) => repositories.join.sendRead({ channelId: write.key, chatNo: write.value }),
    accept: recordFields(row => ({ readNo: row.readNo, chatNo: row.chatNo, metaNo: row.metaNo })),
};

type NotifyMode = DomainJoin['notify'];

export const joinNotifyState: StateSpec<NotifyMode, DataRepositories> = {
    op: 'join.notify',
    deliver: (repositories, write) => repositories.join.sendJoinUpdate(write.key, { notify: write.value }),
    accept: recordFields(row => ({ notify: row.notify })),
    restore: (repositories, write, value) => repositories.join.writeMyJoinLocally(write.key, { notify: value }),
};

export const joinNickState: StateSpec<string, DataRepositories> = {
    op: 'join.nick',
    deliver: (repositories, write) => repositories.join.sendJoinUpdate(write.key, { nick: write.value }),
    accept: recordFields(row => ({ nick: row.nick })),
    restore: (repositories, write, value) => repositories.join.writeMyJoinLocally(write.key, { nick: value }),
};

export const STATE_SPECS = {
    'join.read': joinReadState,
    'join.notify': joinNotifyState,
    'join.nick': joinNickState,
} as const;
