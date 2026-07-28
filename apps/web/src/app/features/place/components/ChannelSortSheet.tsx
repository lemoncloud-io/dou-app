import { useTranslation } from 'react-i18next';

import { BottomSheet, SheetOption } from '@chatic/web-ui-kit';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { DEFAULT_CHANNEL_SORT } from '../../../stores/preferenceKeys';

import type { ChannelSortMethod } from '../../../stores/preferenceKeys';

/** Selectable channel sort methods, in display order. Labels resolve at render (i18n). */
const SORT_METHODS: ReadonlyArray<{ method: ChannelSortMethod; labelKey: string }> = [
    { method: 'recent', labelKey: 'channelSort.recent' },
    { method: 'unread', labelKey: 'channelSort.unread' },
];

interface ChannelSortSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    placeId?: string;
}

/**
 * Channel sort picker — chooses how the home channel list is ordered for THIS place. The choice is
 * saved per place (localStorage, client-only) and applied immediately; there is no explicit save,
 * so picking an option closes the sheet. See ADR-0031.
 */
export const ChannelSortSheet = ({ open, onOpenChange, placeId }: ChannelSortSheetProps) => {
    const { t } = useTranslation();
    const current = usePreferenceStore(s => (placeId ? s.channelSort[placeId] : undefined)) ?? DEFAULT_CHANNEL_SORT;
    const setChannelSort = usePreferenceStore(s => s.setChannelSort);

    const handleSelect = (method: ChannelSortMethod) => () => {
        if (!placeId) return;
        setChannelSort(placeId, method);
        onOpenChange(false);
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('channelSort.title')}
            onClose={() => onOpenChange(false)}
        >
            <div className="px-4 pb-2" role="radiogroup" aria-label={t('channelSort.title')}>
                {SORT_METHODS.map(({ method, labelKey }, index) => (
                    <SheetOption
                        key={method}
                        label={t(labelKey)}
                        selected={current === method}
                        onSelect={handleSelect(method)}
                        showDivider={index < SORT_METHODS.length - 1}
                    />
                ))}
            </div>
        </BottomSheet>
    );
};
