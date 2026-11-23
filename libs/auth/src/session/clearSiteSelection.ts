import { setSelectedSiteId } from '@chatic/session';

export const clearSiteSelection = (): void => {
    setSelectedSiteId(null);
};
