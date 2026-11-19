import type * as React from 'react';

import { cn } from '@chatic/ui-kit';

/** Reader faces past this become a `+N` pill (Figma 5978:37669, "read receipt"). */
const MAX_READER_FACES = 3;

export interface ReadReceiptProps {
    /** Members who have read this message (excludes nobody; the sender counts). */
    readCount: number;
    /** Members who have not read this message yet. */
    unreadCount: number;
    /** Localized "read" label (e.g. "Read"). Host supplies the string. */
    readLabel: string;
    /** Localized "unread" label (e.g. "Unread"). Host supplies the string. */
    unreadLabel: string;
    /** Localized label shown instead of the counts once every member has read (e.g. "Read by all"). */
    allReadLabel: string;
    /**
     * Presentation mode. `count` (default) is the group indicator `Read N • Unread M`.
     * `dm` is the 1:1 KakaoTalk-style badge: just the unread count (0 or 1) while the
     * peer has not read, and nothing once read — labels are unused in this mode.
     * `readers` is the group room's line under my last message: `Read N` and who read it.
     */
    mode?: 'count' | 'dm' | 'readers';
    /**
     * `readers` mode: the faces of who has read, newest-relevant first, as host-built avatar
     * nodes. The first three are drawn; the rest become a `+N` pill. `readCount` is their number.
     */
    readers?: React.ReactNode[];
    className?: string;
}

/**
 * Per-message read receipt — the Figma group-chat indicator next to a message
 * time (node 3209:27289):
 * `Read N • Unread M` while some members are still unread, with the read count in
 * the point color and the unread segment muted. Once nobody is left it collapses to
 * the single all-read label in the point color, because "Read 10" alone made the
 * reader work out from the member count whether that was everyone. In `dm` mode it
 * is a single point-color unread count that disappears once the peer reads.
 * Purely presentational; counts and labels come in as props.
 */
export const ReadReceipt = ({
    readCount,
    unreadCount,
    readLabel,
    unreadLabel,
    allReadLabel,
    mode = 'count',
    readers = [],
    className,
}: ReadReceiptProps) => {
    const hasUnread = unreadCount > 0;

    // The group room's line (Figma 5978:37669): "Read N" and the readers' faces while some have
    // read; "Unconfirmed N" while nobody has yet; the all-read label once nobody is left.
    if (mode === 'readers') {
        const line = 'flex items-center gap-1.5 whitespace-nowrap p-1 text-[10px] font-medium text-description';
        if (!hasUnread) {
            return (
                <span aria-label={allReadLabel} className={cn(line, className)}>
                    {allReadLabel}
                </span>
            );
        }
        if (readCount === 0) {
            return (
                <span aria-label={`${unreadLabel} ${unreadCount}`} className={cn(line, className)}>
                    {unreadLabel} {unreadCount}
                </span>
            );
        }
        const overflow = Math.max(0, readCount - MAX_READER_FACES);
        return (
            <span aria-label={`${readLabel} ${readCount}`} className={cn(line, className)}>
                <span>
                    {readLabel} {readCount}
                </span>
                <span aria-hidden className="flex items-center">
                    {readers.slice(0, MAX_READER_FACES).map((face, index) => (
                        // Overlapped by 4px, keyed by position: the host owns the nodes' identity.
                        <span key={index} className="-mr-1 flex size-5 shrink-0 items-center">
                            {face}
                        </span>
                    ))}
                    {overflow > 0 && (
                        <span className="flex shrink-0 items-center justify-center rounded-3xl border border-background bg-input-border px-1 py-[3px] text-[10px] leading-none tracking-[0.05px] text-foreground">
                            +{overflow}
                        </span>
                    )}
                </span>
            </span>
        );
    }

    // DM mode: a lone point-color unread count (the "1" badge), hidden once read.
    if (mode === 'dm') {
        if (!hasUnread) return null;
        return (
            <span
                aria-label={`${unreadLabel} ${unreadCount}`}
                className={cn(
                    'flex items-center text-[12px] font-semibold leading-4 tracking-[-0.18px] text-main-accent',
                    className
                )}
            >
                {unreadCount}
            </span>
        );
    }

    const textClass = cn('flex items-center gap-1 text-[12px] font-semibold leading-4 tracking-[-0.18px]', className);

    if (!hasUnread) {
        return (
            <span aria-label={allReadLabel} className={cn(textClass, 'text-main-accent')}>
                {allReadLabel}
            </span>
        );
    }

    return (
        <span aria-label={`${readLabel} ${readCount} ${unreadLabel} ${unreadCount}`} className={textClass}>
            <span className="text-main-accent">
                {readLabel} {readCount}
            </span>
            <span aria-hidden className="text-description">
                •
            </span>
            <span className="text-description">
                {unreadLabel} {unreadCount}
            </span>
        </span>
    );
};
