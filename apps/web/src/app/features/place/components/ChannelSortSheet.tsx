import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';

import { BottomSheet, SheetOption } from '@chatic/web-ui-kit';

import { useChannelSort } from '../../../hooks';
import { placeScopeKey } from '@chatic/shared';
import { DEFAULT_CHANNEL_SORT } from '../../../stores/preferenceKeys';

import type { ChannelSortMethod } from '../../../stores/preferenceKeys';

const SORT_METHODS: ReadonlyArray<{ method: ChannelSortMethod; labelKey: string }> = [
    { method: 'recent', labelKey: 'channelSort.recent' },
    { method: 'unread', labelKey: 'channelSort.unread' },
];

interface ChannelSortSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    placeId?: string;
}

export const ChannelSortSheet = ({ open, onOpenChange, placeId }: ChannelSortSheetProps) => {
    const { t } = useTranslation();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const scope = placeScopeKey(selectedCloudId, placeId);
    const { channelSort: channelSortMap, setChannelSort } = useChannelSort();
    const current = (scope ? channelSortMap[scope] : undefined) ?? DEFAULT_CHANNEL_SORT;

    const handleSelect = (method: ChannelSortMethod) => () => {
        if (!scope) return;
        setChannelSort(scope, method);
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
