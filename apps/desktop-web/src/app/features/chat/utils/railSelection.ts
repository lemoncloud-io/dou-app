import { createElement } from 'react';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { MobileAppPointer, isLapsedCloud, type RailCloud } from '../../../shared';

/**
 * What picking a cloud row does, whether it was clicked or reached by its number.
 *
 * A cloud its subscription no longer keeps open cannot be entered — only a subscription reopens it,
 * and those are bought in the mobile app — so the pick says where to go instead of starting a switch
 * that can only fail. The cloud already open is left alone rather than switched to again.
 */
export const selectRailCloud = (
    cloud: RailCloud,
    activeCloudId: string | null,
    onSelect: (cloudId: string) => void,
    t: (key: string) => string
): void => {
    if (isLapsedCloud(cloud)) {
        toast({ title: t('cloud.lapsed.title'), description: createElement(MobileAppPointer) });
        return;
    }
    if (cloud.id !== activeCloudId) onSelect(cloud.id);
};
