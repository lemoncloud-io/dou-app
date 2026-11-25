import type { DomainChat } from '@chatic/runtime-react';

export const compareByChatNo = (a: DomainChat, b: DomainChat): number => {
    const an = a.chatNo || Number.MAX_SAFE_INTEGER;
    const bn = b.chatNo || Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
};
