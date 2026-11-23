import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { IconCheckCircleSolid, douLogo } from '@chatic/web-ui-kit';

import { CloudUnreadBadge } from './CloudUnreadBadge';
import { SELECTED_HIGHLIGHT } from './shared';

interface DouHomeItemProps {
    isSelected: boolean;
    isDisabled: boolean;
    hasUnread?: boolean;
    onSelect: () => void;
}

export const DouHomeItem = ({ isSelected, isDisabled, hasUnread, onSelect }: DouHomeItemProps) => {
    const { t } = useTranslation();

    return (
        <button
            onClick={() => !isDisabled && !isSelected && onSelect()}
            disabled={isDisabled}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2 py-2 transition-colors',
                isSelected && SELECTED_HIGHLIGHT,
                isDisabled && !isSelected && 'cursor-not-allowed opacity-60'
            )}
        >
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#90c304]">
                <img src={douLogo} alt="" className="h-8 w-8" />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-[6px]">
                <span className="truncate text-left text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                    {t('cloudSessionSheet.douHome')}
                </span>
                {hasUnread && <CloudUnreadBadge />}
            </span>
            {isSelected && <IconCheckCircleSolid size={28} className="shrink-0 text-primary" />}
        </button>
    );
};
