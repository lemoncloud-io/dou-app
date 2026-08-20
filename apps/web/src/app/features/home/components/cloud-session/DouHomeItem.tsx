import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { IconCheckCircleSolid, douLogo } from '@chatic/web-ui-kit';

import { CloudUnreadBadge } from './CloudUnreadBadge';
import { SELECTED_HIGHLIGHT } from './shared';

interface DouHomeItemProps {
    isSelected: boolean;
    isDisabled: boolean;
    /** presence badge: a relay-cloud push mark or last-visited unread hint (ADR-0056). */
    hasUnread?: boolean;
    onSelect: () => void;
}

/**
 * DoU Home (relay) row — the relay/default connection surfaced at the top of the
 * "my clouds" list. Relay is not a catalog cloud (it exists only as
 * `selectedCloudId === 'default'`), so it is rendered as a synthetic row. Selecting
 * it returns to relay; the active row shows the trailing green check (Figma 2933-9794).
 */
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
            {/* Green DoU mark: the shared lemon glyph on the brand-green disc. */}
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#90c304]">
                <img src={douLogo} alt="" className="h-8 w-8" />
            </span>
            {/* The label sits in its own span so IT is the element that truncates while the unread
                badge keeps its 20px (Figma 3486:25664); `min-w-0` lets the row shrink past the
                label's min-content width. */}
            <span className="flex min-w-0 flex-1 items-center gap-[6px]">
                <span className="truncate text-left text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                    {t('cloudSessionSheet.douHome', '두유 홈')}
                </span>
                {hasUnread && <CloudUnreadBadge />}
            </span>
            {isSelected && <IconCheckCircleSolid size={28} className="shrink-0 text-primary" />}
        </button>
    );
};
