import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { cloudDisplayName } from '../../../../utils';

// Shared styles for cloud/invite list rows.
export const SELECTED_HIGHLIGHT = 'bg-[#F3F0FF] dark:bg-[#2D2640]';

/** A cloud still being provisioned (not yet selectable). */
export const isProvisioning = (status?: CloudView['status']): boolean => status === 'reserved' || status === 'init';

/**
 * An `active` cloud with no email bound yet — the backend confirmed a cloud reaches `active` with
 * no email at all (a skipped purchase, or a skipped add-cloud request), so this isn't an error
 * state, just an unfinished one. Only checked once provisioning is done: while still `init`/
 * `reserved`, the provisioning row already says everything there is to say.
 */
export const needsEmailBind = (cloud: CloudView): boolean => cloud.status === 'active' && !cloud.email;

/** The one chain cloud management uses too — see `utils/cloudDisplayName`. */
export const getCloudDisplayName = (cloud: CloudView): string => cloudDisplayName(cloud);

/**
 * Ordering for the cloud switcher list: the currently-selected cloud is pinned to the top, and the
 * rest fall in creation order, newest first (`createdAt` descending). Clouds without a `createdAt`
 * (e.g. invited clouds whose cache row does not persist it) sort last. View-only — does not mutate
 * the source list.
 */
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
