import { createElement } from 'react';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { MobileAppPointer, isExpiredCloud, type RailCloud } from '../../../shared';

export const selectRailCloud = (
    cloud: RailCloud,
    activeCloudId: string | null,
    onSelect: (cloudId: string) => void,
    t: (key: string) => string
): void => {
    if (isExpiredCloud(cloud)) {
        toast({ title: t('cloud.lapsed.title'), description: createElement(MobileAppPointer) });
        return;
    }
    if (cloud.id !== activeCloudId) onSelect(cloud.id);
};
