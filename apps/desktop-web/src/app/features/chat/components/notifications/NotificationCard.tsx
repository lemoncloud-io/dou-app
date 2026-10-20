import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { LucideIcon } from 'lucide-react';
import { Hash, MessageCircle, MessagesSquare, SmilePlus } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { avatarStyle, formatListTime, inboxKindOf, isMentionKind, type MentionItem } from '../../../../shared';
import { inboxSource, type InboxSource } from './inboxView';

export const SOURCE_ICON: Record<InboxSource, LucideIcon> = {
    channel: Hash,
    dm: MessageCircle,
    thread: MessagesSquare,
};

/** Why the item is here, as the card's context line says it. */
const whyKey = (item: MentionItem, source: InboxSource): string => {
    const kind = inboxKindOf(item);
    if (kind === 'reply') return 'inbox.why.reply';
    if (kind === 'reaction') return 'inbox.why.reaction';
    if (kind === 'dm') return 'inbox.why.dm';
    return source === 'thread' ? 'inbox.why.threadMention' : 'inbox.why.channelMention';
};

/** A mention reads as one in the body: the `@name` tokens carry the accent, the rest stays plain. */
const MentionBody = ({ text, accent }: { text: string; accent: boolean }) => {
    if (!accent) return <>{text}</>;
    return (
        <>
            {text.split(/(@[^\s@]+)/).map((part, index) =>
                part.startsWith('@') ? (
                    <span key={index} className="font-semibold text-primary-ink">
                        {part}
                    </span>
                ) : (
                    part
                )
            )}
        </>
    );
};

interface NotificationCardProps {
    item: MentionItem;
    /** The channel's name: loaded with the place, else kept with the item when it was captured. */
    channelName?: string;
    /** What the thread a reply answers said, when this device has it. */
    rootPreview?: string;
    /** The card last opened from the panel. */
    isCurrent: boolean;
    onOpen: (id: string) => void;
}

/**
 * One inbox item: who, when and whether it is unread; where it happened and why it is here; then
 * what was said. An unread item sits on a raised card and a read one on the panel itself, so the
 * unread ones stand out without a count; the card opened last carries the accent border.
 */
export const NotificationCard = memo(({ item, channelName, rootPreview, isCurrent, onOpen }: NotificationCardProps) => {
    const { t } = useTranslation();
    const source = inboxSource(item);
    const SourceIcon = SOURCE_ICON[source];
    const kind = inboxKindOf(item);
    const why = t(whyKey(item, source), { emoji: item.emoji ?? '' });
    // A 1:1 is named after its person; a channel by its name, when it is known.
    const where = source === 'dm' ? t('inbox.dmWith', { name: item.ownerName }) : channelName && `# ${channelName}`;
    // A reaction's body is my message, and says so.
    const body = kind === 'reaction' ? t('inbox.mine', { text: item.content }) : item.content;
    const unread = !item.readAt;

    return (
        <li>
            <button
                type="button"
                aria-current={isCurrent || undefined}
                onClick={() => onOpen(item.id)}
                className={cn(
                    'focus-ring flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ease-tactile',
                    isCurrent
                        ? 'border-primary bg-elevated'
                        : unread
                          ? 'border-hairline bg-elevated shadow-raised hover:bg-accent/60'
                          : 'border-transparent hover:bg-accent/60'
                )}
            >
                <span className="relative shrink-0">
                    <Avatar className="h-10 w-10">
                        {item.avatar && <AvatarImage src={item.avatar} alt="" />}
                        <AvatarFallback
                            className="text-callout font-semibold"
                            style={avatarStyle(item.colorSeed ?? item.ownerName)}
                        >
                            {item.ownerName.charAt(0).toUpperCase() || '?'}
                        </AvatarFallback>
                    </Avatar>
                    {/* A reaction is not something the person wrote: the badge says so before the text does. */}
                    {kind === 'reaction' && (
                        <span
                            aria-hidden
                            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-hairline bg-background text-foreground"
                        >
                            <SmilePlus size={10} />
                        </span>
                    )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2">
                        <span className="truncate text-callout font-semibold text-foreground">{item.ownerName}</span>
                        <span className="ml-auto shrink-0 text-micro tabular-nums text-muted-foreground">
                            {formatListTime(item.createdAt)}
                        </span>
                        {unread && (
                            <>
                                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-badge-unread" />
                                <span className="sr-only">{t('inbox.unreadDot')}</span>
                            </>
                        )}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-micro text-muted-foreground">
                        <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-hairline px-1.5 py-px font-medium text-foreground">
                            <SourceIcon size={11} aria-hidden />
                            {t(`inbox.source.${source}`)}
                        </span>
                        {where && <span className="truncate text-foreground">{where}</span>}
                        <span aria-hidden>·</span>
                        <span className="truncate">{why}</span>
                    </span>
                    {rootPreview && (
                        <span className="line-clamp-2 border-l-2 border-hairline pl-2 text-micro text-muted-foreground">
                            {t('inbox.original', { text: rootPreview })}
                        </span>
                    )}
                    <span className="line-clamp-2 whitespace-pre-wrap break-words text-callout text-foreground">
                        <MentionBody text={body} accent={isMentionKind(item)} />
                    </span>
                </span>
            </button>
        </li>
    );
});
NotificationCard.displayName = 'NotificationCard';
