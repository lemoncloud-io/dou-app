import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Clock, Copy } from 'lucide-react';

import type { DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import type { MessageGroup } from '../utils';
import { Skeleton, UserProfilePopover, avatarStyle } from '../../../shared';
import { RichText } from './RichText';

interface MessageRowProps {
    group: MessageGroup;
    onRetry?: (message: DomainChat) => void;
}

const formatTime = (ms: number): string => {
    if (!ms) return '';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const MessageRow = memo(({ group, onRetry }: MessageRowProps) => {
    const { t } = useTranslation();
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Blank the avatar initial while the name resolves so "U" (Unknown) never flashes.
    const initial = group.namePending ? '' : group.ownerName.charAt(0).toUpperCase() || '?';
    const userId = group.ownerId ?? '';

    const copy = (key: string, content: string) => {
        void navigator.clipboard?.writeText(content).then(() => {
            setCopiedKey(key);
            if (copyTimer.current) clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopiedKey(curr => (curr === key ? null : curr)), 1200);
        });
    };

    // Cancel a pending "copied" reset if this row unmounts mid-feedback.
    useEffect(
        () => () => {
            if (copyTimer.current) clearTimeout(copyTimer.current);
        },
        []
    );

    return (
        <div className="group flex gap-3 rounded-md px-2 py-1 -mx-2 transition-colors ease-tactile hover:bg-accent/40">
            <UserProfilePopover userId={userId} fallbackName={group.ownerName}>
                <button type="button" className="focus-ring tactile h-9 w-9 shrink-0 rounded-md">
                    <Avatar className="h-9 w-9 rounded-md">
                        {group.avatar && <AvatarImage src={group.avatar} alt={group.ownerName} />}
                        <AvatarFallback
                            className="rounded-md text-sm font-semibold"
                            style={avatarStyle(group.ownerId || group.ownerName || '?')}
                        >
                            {initial}
                        </AvatarFallback>
                    </Avatar>
                </button>
            </UserProfilePopover>
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline gap-2">
                    {group.namePending ? (
                        <Skeleton className="h-3.5 w-24 rounded" />
                    ) : (
                        <UserProfilePopover userId={userId} fallbackName={group.ownerName}>
                            <button
                                type="button"
                                className="focus-ring truncate rounded text-heading text-foreground hover:underline"
                            >
                                {group.ownerName}
                            </button>
                        </UserProfilePopover>
                    )}
                    <span className="text-caption tabular-nums text-muted-foreground">
                        {formatTime(group.timestamp)}
                    </span>
                </div>
                <div className="flex flex-col gap-0.5">
                    {group.messages.map((message, i) => {
                        const isPending = message.isPending;
                        const isFailed = message.isFailed;
                        const key = String(message.id ?? message.tempId ?? message.chatNo);
                        const content = message.content ?? '';
                        const isCopied = copiedKey === key;
                        const msgTime = formatTime(message.createdAt ?? message.createdAtMs);
                        return (
                            <div key={key} className="group/msg relative pr-8">
                                {i > 0 && msgTime && (
                                    <span className="absolute -left-12 top-0.5 hidden w-10 text-right text-[10px] tabular-nums text-muted-foreground/50 group-hover/msg:block">
                                        {msgTime}
                                    </span>
                                )}
                                <p
                                    className={cn(
                                        'whitespace-pre-wrap break-words text-body',
                                        isFailed ? 'text-destructive' : 'text-foreground',
                                        isPending && 'opacity-50'
                                    )}
                                >
                                    <RichText content={content} />
                                </p>
                                {isFailed && (
                                    <span className="mt-0.5 flex items-center gap-1.5 text-caption text-destructive">
                                        {t('chat.failed')}
                                        {onRetry && (
                                            <button
                                                type="button"
                                                onClick={() => onRetry(message)}
                                                className="focus-ring tactile inline-flex min-h-[36px] items-center font-semibold underline underline-offset-2 hover:opacity-80"
                                            >
                                                {t('chat.retry')}
                                            </button>
                                        )}
                                    </span>
                                )}
                                {group.isMine && !isFailed && (
                                    <span
                                        className="absolute bottom-0 right-0 text-muted-foreground/60"
                                        title={isPending ? t('chat.statusSending') : t('chat.statusSent')}
                                    >
                                        {isPending ? <Clock size={11} /> : <Check size={11} />}
                                    </span>
                                )}
                                {content && (
                                    <button
                                        type="button"
                                        onClick={() => copy(key, content)}
                                        title={isCopied ? t('chat.copied') : t('chat.copy')}
                                        aria-label={t('chat.copy')}
                                        className={cn(
                                            'focus-ring tactile border-hairline absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded border bg-elevated text-muted-foreground shadow-raised transition-opacity ease-tactile hover:bg-accent/40 hover:text-foreground',
                                            isCopied
                                                ? 'opacity-100'
                                                : 'opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/msg:opacity-100'
                                        )}
                                    >
                                        {isCopied ? (
                                            <Check size={12} className="text-primary-ink" />
                                        ) : (
                                            <Copy size={12} />
                                        )}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

MessageRow.displayName = 'MessageRow';
