import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Copy, Trash2 } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

interface ImageMoreMenuProps {
    /** The "⋮" control that opens the menu. */
    trigger: ReactNode;
    onCopy: () => void;
    /** Absent when the viewer cannot delete this file (not their message). */
    onDelete?: () => void;
    onOpenChange?: (open: boolean) => void;
    side?: 'top' | 'bottom';
}

/**
 * "더보기" on one image (Figma): copy that image, delete that file. Both act on the one
 * image the menu hangs off, never the whole message.
 */
export const ImageMoreMenu = ({ trigger, onCopy, onDelete, onOpenChange, side = 'bottom' }: ImageMoreMenuProps) => {
    const { t } = useTranslation();
    return (
        <DropdownMenu onOpenChange={onOpenChange} modal={false}>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                side={side}
                className="min-w-[125px] rounded-2xl border-[0.5px] border-border/70 bg-popover/[0.92] p-1.5 shadow-[0_3px_32px_rgba(0,0,0,0.08)] backdrop-blur-[4px]"
            >
                <DropdownMenuItem
                    onSelect={onCopy}
                    className="cursor-pointer gap-2 rounded-[10px] px-3 py-2.5 text-[14px] font-medium tracking-[-0.01em] text-foreground"
                >
                    <Copy aria-hidden />
                    {t('chat.image.copy')}
                </DropdownMenuItem>
                {onDelete && (
                    <DropdownMenuItem
                        onSelect={onDelete}
                        className={cn(
                            'cursor-pointer gap-2 rounded-[10px] px-3 py-2.5 text-[14px] font-medium tracking-[-0.01em]',
                            'text-destructive focus:text-destructive'
                        )}
                    >
                        <Trash2 aria-hidden />
                        {t('chat.image.delete')}
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
