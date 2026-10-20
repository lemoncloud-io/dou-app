import type { DomainChat } from '@chatic/data';

import { messagePreview } from './messagePreview';
import { threadRootNo, type ThreadReply, type ThreadRoot } from './myThreads';
import { isNotifiableChat } from './notifiableChat';

/**
 * The threads one channel's cached page shows the user taking part in: a root of theirs with a reply,
 * or a thread with a reply of theirs. Each comes as its newest cached reply plus its root, ready for
 * the my-threads record. A thread whose root is not in the page is left out — there would be no root
 * to keep for it.
 */
export const cachedThreads = (
    rows: DomainChat[],
    isMine: (row: DomainChat) => boolean,
    scope: Pick<ThreadReply, 'cid' | 'channelId' | 'placeId' | 'channelKind' | 'channelName'>
): Array<{ reply: ThreadReply; root: ThreadRoot }> => {
    const roots = new Map<string, DomainChat>();
    const replies = new Map<string, DomainChat[]>();
    for (const row of rows) {
        if (row.subType === 'reaction' || !isNotifiableChat(row)) continue;
        if (!row.parentId) {
            if (row.chatNo != null) roots.set(String(row.chatNo), row);
            continue;
        }
        const rootNo = threadRootNo(row.parentId);
        const list = replies.get(rootNo);
        if (list) list.push(row);
        else replies.set(rootNo, [row]);
    }

    const found: Array<{ reply: ThreadReply; root: ThreadRoot }> = [];
    for (const [rootNo, list] of replies) {
        const root = roots.get(rootNo);
        if (!root || !(isMine(root) || list.some(isMine))) continue;
        const newest = list.reduce((a, b) => ((b.chatNo ?? 0) > (a.chatNo ?? 0) ? b : a));
        found.push({
            reply: {
                ...scope,
                rootNo,
                replyNo: newest.chatNo ?? 0,
                preview: messagePreview(newest),
                ownerName: newest.owner$?.name ?? '',
                at: newest.createdAt ?? 0,
                mine: isMine(newest),
            },
            root: { preview: messagePreview(root), ownerName: root.owner$?.name ?? '' },
        });
    }
    return found;
};
