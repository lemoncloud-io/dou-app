import { useTranslation } from 'react-i18next';

import { Download, Forward, Link2, MessageSquareReply, MoreVertical, Trash2 } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { Hint } from '../../../../shared';

const ICON_BUTTON =
    'focus-ring tactile hit-target flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-foreground/[0.08] hover:text-foreground data-[state=open]:bg-foreground/[0.08]';

/**
 * A sent file's Download button and its More menu: Download, Reply in thread, Copy link, Forward and
 * Delete file, each offered only where it is handed in. The voice card and every other file card show
 * the same menu, so a file offers the same things whatever kind it is.
 */
export const FileActions = ({
    name,
    onSave,
    onReply,
    onDelete,
    onCopyLink,
    onForward,
}: {
    name: string;
    onSave: () => void;
    onReply?: () => void;
    onDelete?: () => void;
    onCopyLink?: () => void;
    onForward?: () => void;
}) => {
    const { t } = useTranslation();
    return (
        <>
            <Hint label={t('chat.file.download')}>
                <button
                    type="button"
                    onClick={onSave}
                    aria-label={t('chat.file.save', { name })}
                    className={ICON_BUTTON}
                >
                    <Download size={16} aria-hidden />
                </button>
            </Hint>
            <DropdownMenu modal={false}>
                <Hint label={t('chat.file.moreHint')}>
                    <DropdownMenuTrigger asChild>
                        <button type="button" aria-label={t('chat.file.more', { name })} className={ICON_BUTTON}>
                            <MoreVertical size={16} aria-hidden />
                        </button>
                    </DropdownMenuTrigger>
                </Hint>
                <DropdownMenuContent align="end" className="w-44 shadow-overlay">
                    <DropdownMenuItem onClick={onSave} className="cursor-pointer py-2">
                        <Download size={16} aria-hidden />
                        {t('chat.file.download')}
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
        </>
    );
};
