import type { TFunction } from 'i18next';

import { MENTION_KINDS, THREAD_KINDS, threadRootNo, type NotificationItem } from '../../../utils/notifications';

/** What a notification row draws, worked out from the item — pure, so the screen and the sheet agree. */
export interface NotificationRowParts {
    /** The type chip: an orange mention, a blue thread, or none (a reaction, a new 1:1 message). */
    chip?: 'mention' | 'thread';
    /** "#room" or "1:1". */
    location: string;
    /** Why it is here, or nothing for a plain mention. */
    context?: string;
    /** The original message, one line, already prefixed. */
    quote?: string;
    /** When — the time today, the date before that. */
    time: string;
}

const startOfDay = (time: number): number => {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

/** The row's time: "3:27 PM" for today, "Nov 10" before that, in the reader's language. */
export const formatNotificationTime = (createdAt: number, now: number, locale: string): string =>
    startOfDay(createdAt) === startOfDay(now)
        ? new Date(createdAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
        : new Date(createdAt).toLocaleDateString(locale, { month: 'long', day: 'numeric' });

/** A day group's heading: today, yesterday, or the full date with its weekday. */
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

/** The row's parts for one item (spec: chip by kind, location by room, context by why, quote when it has one). */
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
    return {
        chip,
        location: item.inDm ? t('notifications.inbox.dmLocation') : `#${item.channelName ?? ''}`,
        context,
        quote: item.quote ? t('notifications.inbox.quote', { text: item.quote }) : undefined,
        time: formatNotificationTime(item.createdAt, now, locale),
    };
};

/**
 * Where opening an item goes: its thread for a thread item, else its room, with `?chatNo=` so the
 * page jumps to the message — the convention search already uses. A reaction opens the message
 * reacted to, not the reaction.
 */
export const notificationTarget = (
    item: NotificationItem,
    paths: { room: (channelId: string) => string; thread: (channelId: string, rootNo: string) => string }
): string => {
    const chatNo = item.kind === 'reaction' ? item.targetChatNo : item.chatNo;
    const base = item.parentId ? paths.thread(item.channelId, threadRootNo(item.parentId)) : paths.room(item.channelId);
    return chatNo ? `${base}?chatNo=${chatNo}` : base;
};

/** The body with every `@name` token set apart, so the row can bold it. */
export const splitMentions = (content: string): { text: string; mention: boolean }[] =>
    content
        .split(/(@[^\s@]+)/)
        .filter(part => part.length > 0)
        .map(part => ({ text: part, mention: part.startsWith('@') }));
