import { useTranslation } from 'react-i18next';

import { Copy, Download, Trash2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { Hint } from '../../../../shared';

interface ImageActionsProps {
    onDownload: () => void;
    onCopy: () => void;
    /** Absent when the viewer cannot delete this file. */
    onDelete?: () => void;
    /** `overlay` sits on top of the picture and needs its own surface; `plain` sits on the page. */
    variant?: 'overlay' | 'plain';
    className?: string;
}

const BUTTON = 'focus-ring flex h-9 w-9 items-center justify-center rounded-md transition-colors ease-tactile';

/**
 * Save, copy and delete for one image, as three icon buttons.
 *
 * Copy and delete used to sit in a "More" menu. For anyone who cannot delete (every
 * image someone else sent) that menu held a single item, so copying cost two clicks
 * and a menu that portalled out of the tile, which dropped the bar from under the
 * pointer when it closed.
 */
export const ImageActions = ({ onDownload, onCopy, onDelete, variant = 'plain', className }: ImageActionsProps) => {
    const { t } = useTranslation();
    const tone = 'text-foreground hover:bg-foreground/[0.08]';
    return (
        <div
            className={cn(
                'flex items-center gap-1',
                variant === 'overlay' && 'rounded-lg border border-hairline bg-elevated p-0.5 shadow-raised',
                className
            )}
        >
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
