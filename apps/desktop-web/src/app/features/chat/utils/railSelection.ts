import { createElement } from 'react';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { MobileAppPointer, isExpiredCloud, type RailCloud } from '../../../shared';

/**
 * What picking a cloud row does, whether it was clicked or reached by its number.
 *
 * An expired cloud is released and cannot be entered — only a subscription brings one back, and
 * those are bought in the mobile app — so the pick says where to go instead of starting a switch
 * that can only fail. A suspended cloud is on hold but the server accepts a switch into it, so that
 * pick goes through; a refusal gets the switch flow's own failure toast. The cloud already open is
 * left alone rather than switched to again.
 */
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
