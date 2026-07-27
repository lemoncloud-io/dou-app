import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { SheetOption } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { DEFAULT_CHANNEL_SORT } from '../../../stores/preferenceKeys';

import type { ChannelSortMethod } from '../../../stores/preferenceKeys';

/** Selectable channel sort methods, in display order. Labels resolve at render (i18n). */
const SORT_METHODS: ReadonlyArray<{ method: ChannelSortMethod; labelKey: string }> = [
    { method: 'recent', labelKey: 'channelSort.recent' },
    { method: 'unread', labelKey: 'channelSort.unread' },
];

/**
 * Channel sort picker — chooses how the home channel list is ordered for THIS place. The choice is
 * saved per place (localStorage, client-only) and applied immediately; there is no explicit save.
 * See ADR-0031.
 */
export const ChannelSortPage = () => {
    const { t } = useTranslation();
    const { placeId } = useParams<{ placeId: string }>();
    const current = usePreferenceStore(s => (placeId ? s.channelSort[placeId] : undefined)) ?? DEFAULT_CHANNEL_SORT;
    const setChannelSort = usePreferenceStore(s => s.setChannelSort);

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('channelSort.title')} />
            <div className="flex-1 overflow-y-auto">
                {SORT_METHODS.map(({ method, labelKey }, index) => (
                    <SheetOption
                        key={method}
                        label={t(labelKey)}
                        selected={current === method}
                        onSelect={placeId ? () => setChannelSort(placeId, method) : undefined}
                        showDivider={index < SORT_METHODS.length - 1}
                    />
                ))}
            </div>
        </div>
    );
};
