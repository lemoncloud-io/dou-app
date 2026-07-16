import { useTranslation } from 'react-i18next';

import { Check } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { douLogo } from '@chatic/web-ui-kit';

import { SELECTED_HIGHLIGHT } from './shared';

interface DouHomeItemProps {
    isSelected: boolean;
    isDisabled: boolean;
    onSelect: () => void;
}

/**
 * DoU Home (relay) row — the relay/default connection surfaced at the top of the
 * "my clouds" list. Relay is not a catalog cloud (it exists only as
 * `selectedCloudId === 'default'`), so it is rendered as a synthetic row. Selecting
 * it returns to relay; the active row shows the trailing green check (Figma 2933-9794).
 */
export const DouHomeItem = ({ isSelected, isDisabled, onSelect }: DouHomeItemProps) => {
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
            <span className="flex-1 text-left text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                {t('cloudSessionSheet.douHome', '두유 홈')}
            </span>
            {isSelected && (
                <span className="flex shrink-0 items-center justify-center rounded-full bg-[#b0ea10] p-1.5">
                    <Check size={16} className="text-white" strokeWidth={3} />
                </span>
            )}
        </button>
    );
};
