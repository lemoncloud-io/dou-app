import type { DomainChat } from '@chatic/data';

/**
 * Order two chats oldest→newest by chatNo. chatNo is a 1-based sequence; an
 * optimistic (still-pending) send carries the sentinel `chatNo: 0`, so treat 0
 * (and a missing no) as newest — a just-sent message sorts to the bottom, not
 * above older ones. createdAt breaks ties so multiple pendings keep send order.
 */
export const compareByChatNo = (a: DomainChat, b: DomainChat): number => {
    const an = a.chatNo || Number.MAX_SAFE_INTEGER;
    const bn = b.chatNo || Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
};
