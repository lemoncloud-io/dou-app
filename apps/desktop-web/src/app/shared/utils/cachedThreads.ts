import { isEventChat, type DomainChat } from '@chatic/runtime';

import { messagePreview } from './messagePreview';
import { chatSenderName } from './senderName';
import type { MessageViewer } from './viewer';
import { threadRootNo, type ThreadReply, type ThreadRoot } from './myThreads';
import { isNotifiableChat } from './notifiableChat';

export const cachedThreads = (
    rows: DomainChat[],
    isMine: (row: DomainChat) => boolean,
    scope: Pick<ThreadReply, 'cid' | 'channelId' | 'placeId' | 'channelKind' | 'channelName'>,
    viewer?: MessageViewer
): Array<{ reply: ThreadReply; root: ThreadRoot }> => {
    const roots = new Map<string, DomainChat>();
    const replies = new Map<string, DomainChat[]>();
    for (const row of rows) {
        if (isEventChat(row) || !isNotifiableChat(row)) continue;
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
                ownerName: chatSenderName(newest, scope.placeId, viewer),
                at: newest.createdAt ?? 0,
                mine: isMine(newest),
            },
            root: { preview: messagePreview(root), ownerName: chatSenderName(root, scope.placeId, viewer) },
        });
    }
    return found;
};
