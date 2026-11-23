export type NotificationKind =
    | 'mention'
    | 'threadMention'
    | 'replyToMine'
    | 'participatedThread'
    | 'reaction'
    | 'dmMessage';

export interface NotificationItem {
    id: string;
    cloudId: string;
    placeId?: string;
    channelId: string;
    channelName?: string;
    inDm?: true;
    chatNo?: number;
    parentId?: string;
    kind: NotificationKind;
    emoji?: string;
    targetChatNo?: number;
    ownerId?: string;
    ownerName: string;
    content: string;
    quote?: string;
    createdAt: number;
    read: boolean;
}

export const NOTIFICATION_TABS = ['all', 'group', 'dm', 'thread', 'mention'] as const;
export type NotificationTab = (typeof NOTIFICATION_TABS)[number];

export const MENTION_KINDS: ReadonlySet<NotificationKind> = new Set(['mention', 'threadMention']);

export const THREAD_KINDS: ReadonlySet<NotificationKind> = new Set(['replyToMine', 'participatedThread']);

export const FIND_ME_KINDS: ReadonlySet<NotificationKind> = new Set([
    'mention',
    'threadMention',
    'replyToMine',
    'reaction',
]);

export const notificationId = (cloudId: string, chatId: string): string => `${cloudId}:${chatId}`;

export const reactionNotificationId = (
    cloudId: string,
    targetChatId: string,
    emoji: string,
    authorId: string
): string => `${cloudId}:reaction:${targetChatId}:${emoji}:${authorId}`;

export const NOTIFICATION_PREVIEW_CHARS = 240;

export const truncatePreview = (text: string): string =>
    text.length > NOTIFICATION_PREVIEW_CHARS ? text.slice(0, NOTIFICATION_PREVIEW_CHARS) : text;

export const threadRootNo = (parentId: string): string => parentId.slice(parentId.lastIndexOf(':') + 1);

export const threadKey = (cloudId: string, channelId: string, rootNo: string): string =>
    `${cloudId}:${channelId}:${rootNo}`;
