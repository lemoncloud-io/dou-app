import { useCallback, useMemo } from 'react';

import { runtime } from '@chatic/runtime-react';
import { normalizeHomeSectionsCollapsed } from '../../../stores/preferenceParsers';
import type { HomeSectionId } from '../../../stores/preferenceKeys';

export const setHomeSectionOpen = (section: HomeSectionId, open: boolean): void => {
    const { [section]: _previous, ...rest } = normalizeHomeSectionsCollapsed(
        runtime.settings.get('ui.homeSectionsCollapsed')
    );
    runtime.settings.set('ui.homeSectionsCollapsed', open ? rest : { ...rest, [section]: true }, { lane: 'local' });
};

export const useHomeSections = () => {
    const raw = runtime.settings.useConfigValue('ui.homeSectionsCollapsed');
    const collapsed = useMemo(() => normalizeHomeSectionsCollapsed(raw), [raw]);
    const isOpen = useCallback((section: HomeSectionId) => !collapsed[section], [collapsed]);
    return { isOpen, setOpen: setHomeSectionOpen };
};
