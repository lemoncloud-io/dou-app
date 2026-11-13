import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Copy, Download, Forward, Link2, MessageSquareReply, MoreVertical, Trash2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { Hint } from '../../../../shared';

interface ImageActionsProps {
    onDownload: () => void;
    onCopy: () => void;
    /** Absent when the viewer cannot delete this file. */
    onDelete?: () => void;
    /** The tile's More menu offers what every file's does; each is absent where it does not apply. */
    onReply?: () => void;
    onCopyLink?: () => void;
    onForward?: () => void;
    /** `overlay` sits on top of the picture and needs its own surface; `plain` sits on the page. */
    variant?: 'overlay' | 'plain';
    className?: string;
}

const BUTTON = 'focus-ring flex h-9 w-9 items-center justify-center rounded-md transition-colors ease-tactile';

const OVERLAY_BUTTON =
    'focus-ring flex items-center justify-center rounded p-0.5 text-foreground transition-colors ease-tactile';

/**
 * Save, copy and delete for one image.
 *
 * `plain` (the viewer) shows three icon buttons. `overlay` (the tile in the feed)
 * follows the design: Download, then a "More" menu holding Copy, then Reply in thread, Copy link and
 * Forward as every file's menu has them, and Delete. The menu
 * renders in a portal, so the pointer leaves the tile while it is open; the bar is
 * pinned visible for as long as the menu is open so it does not vanish under it.
 */
export const ImageActions = ({
    onDownload,
    onCopy,
    onDelete,
    onReply,
    onCopyLink,
    onForward,
    variant = 'plain',
    className,
}: ImageActionsProps) => {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);
    if (variant === 'overlay') {
        return (
            <div
                className={cn(
                    'flex items-center gap-2 rounded-lg border border-hairline bg-elevated/70 px-2 py-1.5 shadow-raised backdrop-blur-[4px]',
                    className,
                    menuOpen && 'opacity-100 [@media(hover:hover)]:opacity-100'
                )}
            >
                <Hint label={t('chat.image.download')}>
                    <button
                        type="button"
                        onClick={onDownload}
                        aria-label={t('chat.image.download')}
                        className={cn(OVERLAY_BUTTON, 'hover:bg-foreground/[0.08]')}
                    >
                        <Download size={16} aria-hidden />
                    </button>
                </Hint>
                <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={t('chat.more')}
                            className={cn(
                                OVERLAY_BUTTON,
                                'hover:bg-foreground/[0.08] data-[state=open]:bg-foreground/[0.08]'
                            )}
                        >
                            <MoreVertical size={16} aria-hidden />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44 shadow-overlay">
                        <DropdownMenuItem onClick={onCopy} className="cursor-pointer py-2">
                            <Copy size={16} aria-hidden />
                            {t('chat.image.copy')}
                        </DropdownMenuItem>
                        {onReply && (
                            <DropdownMenuItem onClick={onReply} className="cursor-pointer py-2">
                                <MessageSquareReply size={16} aria-hidden />
                                {t('chat.file.replyInThread')}
                            </DropdownMenuItem>
                        )}
                        {onCopyLink && (
                            <DropdownMenuItem onClick={onCopyLink} className="cursor-pointer py-2">
                                <Link2 size={16} aria-hidden />
                                {t('chat.file.copyLink')}
                            </DropdownMenuItem>
                        )}
                        {onForward && (
                            <DropdownMenuItem onClick={onForward} className="cursor-pointer py-2">
                                <Forward size={16} aria-hidden />
                                {t('chat.file.forward')}
                            </DropdownMenuItem>
                        )}
                        {onDelete && (
                            <DropdownMenuItem
                                onClick={onDelete}
                                className="cursor-pointer py-2 text-destructive focus:text-destructive"
                            >
                                <Trash2 size={16} aria-hidden />
                                {t('chat.image.delete')}
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        );
    }
    const tone = 'text-foreground hover:bg-foreground/[0.08]';
    return (
        <div className={cn('flex items-center gap-1', className)}>
            <Hint label={t('chat.image.download')}>
                <button
                    type="button"
                    onClick={onDownload}
                    aria-label={t('chat.image.download')}
                    className={cn(BUTTON, tone)}
                >
                    <Download size={16} aria-hidden />
                </button>
            </Hint>
            <Hint label={t('chat.image.copy')}>
                <button type="button" onClick={onCopy} aria-label={t('chat.image.copy')} className={cn(BUTTON, tone)}>
                    <Copy size={16} aria-hidden />
                </button>
            </Hint>
            {onDelete && (
                <Hint label={t('chat.image.delete')}>
                    <button
                        type="button"
                        onClick={onDelete}
                        aria-label={t('chat.image.delete')}
                        className={cn(BUTTON, 'text-destructive hover:bg-destructive/10')}
                    >
                        <Trash2 size={16} aria-hidden />
                    </button>
                </Hint>
            )}
        </div>
    );
};
