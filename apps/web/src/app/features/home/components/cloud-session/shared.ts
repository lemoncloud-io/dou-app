import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { cloudDisplayName } from '../../../../utils';

export const SELECTED_HIGHLIGHT = 'bg-[#F3F0FF] dark:bg-[#2D2640]';

export const isProvisioning = (status?: CloudView['status']): boolean => status === 'reserved' || status === 'init';

export const getCloudDisplayName = (cloud: CloudView): string => cloudDisplayName(cloud);

export const sortCloudsForSwitcher = <T extends { id?: string; createdAt?: number }>(
    list: T[],
    selectedId?: string | null
): T[] =>
    [...list].sort((a, b) => {
        const aSelected = !!selectedId && a.id === selectedId;
        const bSelected = !!selectedId && b.id === selectedId;
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
