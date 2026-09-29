import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import type { ComposerAttachment } from '../../hooks';
import { MAX_ATTACHMENTS } from '../../utils';
import { ImageSpinner } from './ImageSpinner';
import { Hint, hoverReveal } from '../../../../shared';

interface ComposerAttachmentsProps {
    attachments: ComposerAttachment[];
    onRemove: (id: string) => void;
    /** Where focus goes once the last attachment is removed: the message input. */
    onEmptied?: () => void;
}

/**
 * The tray of picked images inside the composer (Figma "Image"): 92px tiles in one row
 * that scrolls sideways, a spinner until a preview has decoded, the remove "×" on hover
 * or focus ("delete button on hover"), and how many of the ten are used.
 *
 * The row used to wrap, so ten images took about 40% of the window and pushed the
 * conversation out of view while you wrote the message that goes with them.
 */
export const ComposerAttachments = ({ attachments, onRemove, onEmptied }: ComposerAttachmentsProps) => {
    const { t } = useTranslation();
    const listRef = useRef<HTMLUListElement>(null);
    // Removing a tile unmounts the button that had focus, which dropped it on <body>.
    // The position it left is where focus goes next: the tile that slid into it, the
    // new last tile, or the message input once the tray is empty.
    const refocusAt = useRef<number | null>(null);
    // A screen reader heard nothing when images joined or left the tray.
    // Each message gets its own node, so the same words twice ("1 image added") are said twice.
    const [announcement, setAnnouncementState] = useState({ text: '', seq: 0 });
    const setAnnouncement = (text: string) => setAnnouncementState(current => ({ text, seq: current.seq + 1 }));
    const previousCount = useRef(attachments.length);
    // Previews that have decoded. Local to the tray: it was a second decode through
    // `new Image()` in the hook, for a flag only this spinner reads.
    const [decoded, setDecoded] = useState<ReadonlySet<string>>(() => new Set());
    const markDecoded = (id: string) => setDecoded(current => (current.has(id) ? current : new Set(current).add(id)));

    useEffect(() => {
        const added = attachments.length - previousCount.current;
        previousCount.current = attachments.length;
        if (added > 0) setAnnouncement(t('chat.attach.announce.added', { count: added }));

        const at = refocusAt.current;
        if (at === null) return;
        refocusAt.current = null;
        const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-remove]') ?? [];
        const next = buttons[Math.min(at, buttons.length - 1)];
        if (next) next.focus();
        else onEmptied?.();
    }, [attachments, onEmptied, t]);

    const remove = (index: number, attachment: ComposerAttachment) => {
        refocusAt.current = index;
        setAnnouncement(t('chat.attach.announce.removed', { name: attachment.name }));
        onRemove(attachment.id);
    };

    return (
        <>
            {/* Mounted with the tray empty too: the last removal is announced after the list is gone. */}
            <span role="status" aria-live="polite" className="sr-only">
                <span key={announcement.seq}>{announcement.text}</span>
            </span>
            {attachments.length > 0 && (
                <div className="flex items-end gap-3">
                    <ul
                        ref={listRef}
                        aria-label={t('chat.attach.tray')}
                        // pt/pr leave room for the "×" that overhangs each tile's corner.
                        className="scrollbar-thin flex min-w-0 flex-1 gap-3.5 overflow-x-auto pb-1 pr-2 pt-2"
                    >
                        {attachments.map((attachment, index) => {
                            const isDecoding = !decoded.has(attachment.id);
                            return (
                                <li
                                    key={attachment.id}
                                    aria-busy={isDecoding || undefined}
                                    className="group/att relative h-[92px] w-[92px] shrink-0"
                                >
                                    <div className="h-full w-full overflow-hidden rounded-2xl border border-hairline bg-muted">
                                        <img
                                            src={attachment.url}
                                            alt={attachment.name}
                                            decoding="async"
                                            draggable={false}
                                            onLoad={() => markDecoded(attachment.id)}
                                            onError={() => markDecoded(attachment.id)}
                                            className={cn('h-full w-full object-cover', isDecoding && 'blur-[1px]')}
                                        />
                                        {isDecoding && (
                                            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-overlay/40">
                                                <ImageSpinner className="h-5 w-5 border-2" />
                                            </span>
                                        )}
                                    </div>
                                    <Hint label={t('chat.attach.remove', { name: attachment.name })}>
                                        <button
                                            type="button"
                                            data-remove=""
                                            onClick={() => remove(index, attachment)}
                                            aria-label={t('chat.attach.remove', { name: attachment.name })}
                                            className={cn(
                                                'focus-ring hit-target absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-background bg-foreground text-background',
                                                hoverReveal('att')
                                            )}
                                        >
                                            <X size={14} aria-hidden />
                                        </button>
                                    </Hint>
                                </li>
                            );
                        })}
                    </ul>
                    <span className="shrink-0 pb-1 text-caption tabular-nums text-muted-foreground">
                        <span aria-hidden>
                            {attachments.length}/{MAX_ATTACHMENTS}
                        </span>
                        <span className="sr-only">
                            {t('chat.attach.countLabel', { count: attachments.length, max: MAX_ATTACHMENTS })}
                        </span>
                    </span>
                </div>
            )}
        </>
    );
};
