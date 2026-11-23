import type { DomainChannel, DomainChat, DomainJoin, DomainUser } from '@chatic/runtime';

export type { DomainChannel, DomainChat, DomainJoin, DomainUser };

export interface ClientChatView extends DomainChat {
    isOwner: boolean;
    isSystem: boolean;
    ownerName: string;
    timestamp: Date;
}

export interface ClientChannelView extends DomainChannel {
    isOwner: boolean;
    isSelfChat: boolean;
    memberCount: number;
}

export type ChannelMember = Partial<DomainUser> & {
    id: string;
    $join?: DomainJoin;
};
