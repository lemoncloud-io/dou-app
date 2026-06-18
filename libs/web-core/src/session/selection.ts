import { cloudCore } from '../core';
import { relayCore } from '../core';

export const getSelectedCloudId = (): string => cloudCore.getSelectedCloudId() || 'default';

export const getSelectedSiteId = (): string | null =>
    getSelectedCloudId() === 'default' ? relayCore.getSelectedSiteId() : cloudCore.getSelectedSiteId();

export const setSelectedCloudId = (cloudId: string): void => {
    cloudCore.saveSelectedCloudId(cloudId);
};

export const setSelectedSiteId = (siteId: string | null): void => {
    const selectedCloudId = getSelectedCloudId();
    if (siteId) {
        if (selectedCloudId === 'default') {
            relayCore.saveSelectedSiteId(siteId);
        } else {
            cloudCore.saveSelectedSiteId(siteId);
        }
        return;
    }

    if (selectedCloudId === 'default') {
        relayCore.clearSelectedSite();
    } else {
        cloudCore.clearSelectedSite();
    }
};
