import type { TFunction } from 'i18next';

import { MENTION_KINDS, THREAD_KINDS, threadRootNo, type NotificationItem } from '../../../utils/notifications';

export interface NotificationRowParts {
    chip?: 'mention' | 'thread';
    location: string;
    context?: string;
    quote?: string;
    body: string;
    time: string;
}

const startOfDay = (time: number): number => {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

export const formatNotificationTime = (createdAt: number, now: number, locale: string): string =>
    startOfDay(createdAt) === startOfDay(now)
        ? new Date(createdAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
        : new Date(createdAt).toLocaleDateString(locale, { month: 'long', day: 'numeric' });

export const formatDayHeading = (
    day: 'today' | 'yesterday' | 'date',
    dayStart: number,
    t: TFunction,
    locale: string
): string =>
    day === 'today'
        ? t('notifications.inbox.today')
        : day === 'yesterday'
          ? t('notifications.inbox.yesterday')
          : new Date(dayStart).toLocaleDateString(locale, { month: 'long', day: 'numeric', weekday: 'long' });

export const notificationRowParts = (
    item: NotificationItem,
    t: TFunction,
    now: number,
    locale: string
): NotificationRowParts => {
    const chip = MENTION_KINDS.has(item.kind) ? 'mention' : THREAD_KINDS.has(item.kind) ? 'thread' : undefined;
    const context =
        item.kind === 'threadMention'
            ? t('notifications.inbox.context.threadMention')
            : item.kind === 'replyToMine'
              ? t('notifications.inbox.context.replyToMine')
              : item.kind === 'participatedThread'
                ? t('notifications.inbox.context.participatedThread')
                : item.kind === 'reaction'
                  ? t('notifications.inbox.context.reaction', { emoji: item.emoji ?? '' })
                  : item.kind === 'dmMessage'
                    ? t('notifications.inbox.context.dmMessage')
                    : undefined;
    const reaction = item.kind === 'reaction';
    return {
        chip,
        location: item.inDm ? t('notifications.inbox.dmLocation') : `#${item.channelName ?? ''}`,
        context,
        quote: item.quote && !reaction ? t('notifications.inbox.quote', { text: item.quote }) : undefined,
        body: reaction ? item.quote || item.content : item.content,
        time: formatNotificationTime(item.createdAt, now, locale),
    };
};

export const notificationTarget = (
    item: NotificationItem,
    paths: { room: (channelId: string) => string; thread: (channelId: string, rootNo: string) => string }
): string => {
    const chatNo = item.kind === 'reaction' ? item.targetChatNo : item.chatNo;
    const base = item.parentId ? paths.thread(item.channelId, threadRootNo(item.parentId)) : paths.room(item.channelId);
    return chatNo ? `${base}?chatNo=${chatNo}` : base;
};

export const splitMentions = (content: string): { text: string; mention: boolean }[] =>
    content
        .split(/(@[^\s@]+)/)
        .filter(part => part.length > 0)
        .map(part => ({ text: part, mention: part.startsWith('@') }));

export const countedActionLabel = (t: TFunction, key: string, count: number): string =>
    count > 0 ? t(key, { count }) : t(`${key}None`);
